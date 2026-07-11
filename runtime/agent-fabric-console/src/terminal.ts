export const TERMINAL_SEQUENCES = Object.freeze({
  alternateScreenOn: "\u001b[?1049h",
  alternateScreenOff: "\u001b[?1049l",
  cursorHide: "\u001b[?25l",
  cursorShow: "\u001b[?25h",
  bracketedPasteOn: "\u001b[?2004h",
  bracketedPasteOff: "\u001b[?2004l",
  mouseOn: "\u001b[?1002h\u001b[?1006h",
  mouseOff: "\u001b[?1006l\u001b[?1002l",
  enter: "\u001b[?1049h\u001b[?25l\u001b[?2004h",
  restore:
    "\u001b[?1006l\u001b[?1002l\u001b[?2004l\u001b[?25h\u001b[?1049l",
} as const);

const TERMINATION_SIGNALS = ["SIGINT", "SIGHUP", "SIGTERM"] as const;
type TerminationSignal = (typeof TERMINATION_SIGNALS)[number];
type TerminalLifecycleSignal = TerminationSignal | "SIGTSTP" | "SIGCONT";

export type TerminalDimensions = Readonly<{
  columns: number;
  rows: number;
}>;

export type TerminalInput = {
  readonly isTTY?: boolean;
  readonly isRaw?: boolean;
  readonly readableFlowing?: boolean | null;
  setRawMode?(enabled: boolean): unknown;
  resume(): unknown;
  pause(): unknown;
};

export type TerminalOutput = {
  readonly isTTY?: boolean;
  readonly columns?: number;
  readonly rows?: number;
  write(value: string): unknown;
  on(event: "resize", listener: () => void): unknown;
  removeListener(event: "resize", listener: () => void): unknown;
};

export type TerminalLifecycleTarget = {
  on(event: TerminalLifecycleSignal | "exit", listener: () => void): unknown;
  removeListener(
    event: TerminalLifecycleSignal | "exit",
    listener: () => void,
  ): unknown;
};

export type TerminalSessionOptions = Readonly<{
  input: TerminalInput;
  output: TerminalOutput;
  mouseCapture: boolean;
  signalTarget: TerminalLifecycleTarget;
  onSignal: (signal: TerminationSignal) => void;
  onSuspend?: () => void;
  onResume?: () => void;
  onResize?: (dimensions: TerminalDimensions) => void;
  scheduleResize?: (callback: () => void) => unknown;
  cancelResize?: (handle: unknown) => void;
}>;

function scheduleImmediate(callback: () => void): NodeJS.Immediate {
  return setImmediate(callback);
}

function cancelImmediate(handle: unknown): void {
  clearImmediate(handle as NodeJS.Immediate);
}

export class TerminalSession {
  readonly #input: TerminalInput;
  readonly #output: TerminalOutput;
  readonly #signalTarget: TerminalLifecycleTarget;
  readonly #onSignal: (signal: TerminationSignal) => void;
  readonly #onSuspend: (() => void) | undefined;
  readonly #onResume: (() => void) | undefined;
  readonly #onResize: ((dimensions: TerminalDimensions) => void) | undefined;
  readonly #scheduleResize: (callback: () => void) => unknown;
  readonly #cancelResize: (handle: unknown) => void;
  readonly #previousRaw: boolean;
  readonly #wasFlowing: boolean;
  readonly #handlers = new Map<TerminalLifecycleSignal, () => void>();
  readonly #exitHandler: () => void;
  readonly #resizeHandler: () => void;
  #lastDimensions: string | null = null;
  #pendingResizeHandle: unknown | null = null;
  #desiredMouseCapture = false;
  #activeMouseCapture = false;
  #editorActive = false;
  #interactive = false;
  #suspended = false;
  #closed = false;

  constructor(options: TerminalSessionOptions) {
    this.#input = options.input;
    this.#output = options.output;
    this.#signalTarget = options.signalTarget;
    this.#onSignal = options.onSignal;
    this.#onSuspend = options.onSuspend;
    this.#onResume = options.onResume;
    this.#onResize = options.onResize;
    this.#scheduleResize = options.scheduleResize ?? scheduleImmediate;
    this.#cancelResize = options.cancelResize ?? cancelImmediate;
    this.#exitHandler = (): void => {
      try {
        this.close();
      } catch {
        // An exit hook cannot delay process.exit. Restoration already attempted
        // every synchronous step before any aggregate failure was produced.
      }
    };
    this.#resizeHandler = (): void => {
      this.#queueResize();
    };
    if (
      options.input.isTTY !== true ||
      options.output.isTTY !== true ||
      typeof options.input.setRawMode !== "function"
    ) {
      throw new Error("Console terminal setup requires a TTY input and output");
    }
    this.#previousRaw = options.input.isRaw === true;
    this.#wasFlowing = options.input.readableFlowing === true;
    this.#desiredMouseCapture = options.mouseCapture;

    try {
      this.#installLifecycleHandlers();
      this.#enterInteractive();
      this.#emitResize(true);
    } catch (error) {
      this.#restoreAfterSetupFailure();
      throw new Error("Console terminal setup failed", { cause: error });
    }
  }

  get mouseCapture(): boolean {
    return this.#desiredMouseCapture;
  }

  get dimensions(): TerminalDimensions {
    const columns = this.#output.columns;
    const rows = this.#output.rows;
    return {
      columns:
        typeof columns === "number" && Number.isFinite(columns)
          ? Math.max(0, Math.trunc(columns))
          : 0,
      rows:
        typeof rows === "number" && Number.isFinite(rows)
          ? Math.max(0, Math.trunc(rows))
          : 0,
    };
  }

  setMouseCapture(enabled: boolean): void {
    if (this.#closed) {
      throw new Error("Console terminal session is closed");
    }
    this.#desiredMouseCapture = enabled;
    if (this.#interactive) {
      this.#syncMouseCapture();
    }
  }

  setEditorActive(enabled: boolean): void {
    if (this.#closed) {
      throw new Error("Console terminal session is closed");
    }
    if (enabled === this.#editorActive) return;
    this.#editorActive = enabled;
    if (this.#interactive) {
      this.#output.write(
        enabled ? TERMINAL_SEQUENCES.cursorShow : TERMINAL_SEQUENCES.cursorHide,
      );
    }
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#cancelPendingResize();
    this.#removeLifecycleHandlers();
    const failures = this.#interactive ? this.#leaveInteractive() : [];
    this.#desiredMouseCapture = false;
    this.#activeMouseCapture = false;
    this.#suspended = false;
    if (failures.length > 0) {
      throw new AggregateError(failures, "Console terminal restoration failed");
    }
  }

  #enterInteractive(): void {
    this.#input.setRawMode?.(true);
    this.#input.resume();
    this.#output.write(TERMINAL_SEQUENCES.enter);
    this.#interactive = true;
    this.#activeMouseCapture = false;
    this.#syncMouseCapture();
    if (this.#editorActive) {
      this.#output.write(TERMINAL_SEQUENCES.cursorShow);
    }
  }

  #leaveInteractive(): unknown[] {
    const failures: unknown[] = [];
    try {
      this.#output.write(TERMINAL_SEQUENCES.restore);
    } catch (error) {
      failures.push(error);
    }
    this.#interactive = false;
    this.#activeMouseCapture = false;
    try {
      this.#input.setRawMode?.(this.#previousRaw);
    } catch (error) {
      failures.push(error);
    }
    try {
      if (this.#wasFlowing) {
        this.#input.resume();
      } else {
        this.#input.pause();
      }
    } catch (error) {
      failures.push(error);
    }
    return failures;
  }

  #syncMouseCapture(): void {
    if (this.#desiredMouseCapture === this.#activeMouseCapture) return;
    this.#output.write(
      this.#desiredMouseCapture
        ? TERMINAL_SEQUENCES.mouseOn
        : TERMINAL_SEQUENCES.mouseOff,
    );
    this.#activeMouseCapture = this.#desiredMouseCapture;
  }

  #suspend(): void {
    if (this.#closed || this.#suspended) return;
    this.#cancelPendingResize();
    const failures = this.#leaveInteractive();
    this.#suspended = true;
    if (failures.length > 0) {
      throw new AggregateError(
        failures,
        "Console terminal suspension restoration failed",
      );
    }
    this.#onSuspend?.();
  }

  #resume(): void {
    if (this.#closed || !this.#suspended) return;
    this.#enterInteractive();
    this.#suspended = false;
    this.#emitResize(true);
    this.#onResume?.();
  }

  #queueResize(): void {
    if (
      this.#closed ||
      this.#suspended ||
      this.#onResize === undefined ||
      this.#pendingResizeHandle !== null
    ) {
      return;
    }
    this.#pendingResizeHandle = this.#scheduleResize(() => {
      this.#pendingResizeHandle = null;
      this.#emitResize(false);
    });
  }

  #cancelPendingResize(): void {
    if (this.#pendingResizeHandle === null) return;
    this.#cancelResize(this.#pendingResizeHandle);
    this.#pendingResizeHandle = null;
  }

  #emitResize(force: boolean): void {
    if (this.#closed || this.#onResize === undefined) return;
    const dimensions = this.dimensions;
    const key = `${String(dimensions.columns)}x${String(dimensions.rows)}`;
    if (!force && key === this.#lastDimensions) return;
    this.#lastDimensions = key;
    this.#onResize(dimensions);
  }

  #installLifecycleHandlers(): void {
    for (const signal of TERMINATION_SIGNALS) {
      const handler = (): void => {
        try {
          this.close();
        } finally {
          this.#onSignal(signal);
        }
      };
      this.#handlers.set(signal, handler);
      this.#signalTarget.on(signal, handler);
    }
    const suspend = (): void => this.#suspend();
    const resume = (): void => this.#resume();
    this.#handlers.set("SIGTSTP", suspend);
    this.#handlers.set("SIGCONT", resume);
    this.#signalTarget.on("SIGTSTP", suspend);
    this.#signalTarget.on("SIGCONT", resume);
    this.#signalTarget.on("exit", this.#exitHandler);
    this.#output.on("resize", this.#resizeHandler);
  }

  #removeLifecycleHandlers(): void {
    for (const [signal, handler] of this.#handlers) {
      this.#signalTarget.removeListener(signal, handler);
    }
    this.#handlers.clear();
    this.#signalTarget.removeListener("exit", this.#exitHandler);
    this.#output.removeListener("resize", this.#resizeHandler);
  }

  #restoreAfterSetupFailure(): void {
    this.#cancelPendingResize();
    this.#removeLifecycleHandlers();
    try {
      this.#output.write(TERMINAL_SEQUENCES.restore);
    } catch {
      // Raw mode restoration below remains mandatory even if output died.
    }
    try {
      this.#input.setRawMode?.(this.#previousRaw);
    } catch {
      // Constructor reports setup failure after every restoration attempt.
    }
    if (this.#wasFlowing) {
      this.#input.resume();
    } else {
      this.#input.pause();
    }
    this.#activeMouseCapture = false;
    this.#desiredMouseCapture = false;
    this.#interactive = false;
    this.#closed = true;
  }
}

export async function withTerminalSession<T>(
  options: TerminalSessionOptions,
  work: (session: TerminalSession) => Promise<T>,
): Promise<T> {
  const session = new TerminalSession(options);
  try {
    const result = await work(session);
    session.close();
    return result;
  } catch (error) {
    try {
      session.close();
    } catch (restorationError) {
      throw new AggregateError(
        [error, restorationError],
        "Console work and terminal restoration both failed",
      );
    }
    throw error;
  }
}

export const TERMINAL_SEQUENCES = Object.freeze({
  bracketedPasteOn: "\u001b[?2004h",
  bracketedPasteOff: "\u001b[?2004l",
  mouseOn: "\u001b[?1002h\u001b[?1006h",
  mouseOff: "\u001b[?1006l\u001b[?1002l",
  restore: "\u001b[?1006l\u001b[?1002l\u001b[?2004l",
} as const);

const RESTORED_SIGNALS = ["SIGINT", "SIGHUP", "SIGTERM"] as const;
type RestoredSignal = (typeof RESTORED_SIGNALS)[number];

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
  on(event: RestoredSignal | "exit", listener: () => void): unknown;
  removeListener(event: RestoredSignal | "exit", listener: () => void): unknown;
};

export type TerminalSessionOptions = Readonly<{
  input: TerminalInput;
  output: TerminalOutput;
  mouseCapture: boolean;
  signalTarget: TerminalLifecycleTarget;
  onSignal: (signal: RestoredSignal) => void;
  onResize?: (dimensions: TerminalDimensions) => void;
}>;

export class TerminalSession {
  readonly #input: TerminalInput;
  readonly #output: TerminalOutput;
  readonly #signalTarget: TerminalLifecycleTarget;
  readonly #onSignal: (signal: RestoredSignal) => void;
  readonly #onResize: ((dimensions: TerminalDimensions) => void) | undefined;
  readonly #previousRaw: boolean;
  readonly #wasFlowing: boolean;
  readonly #handlers = new Map<RestoredSignal, () => void>();
  readonly #exitHandler: () => void;
  readonly #resizeHandler: () => void;
  #lastDimensions: string | null = null;
  #mouseCapture = false;
  #closed = false;

  constructor(options: TerminalSessionOptions) {
    this.#input = options.input;
    this.#output = options.output;
    this.#signalTarget = options.signalTarget;
    this.#onSignal = options.onSignal;
    this.#onResize = options.onResize;
    this.#exitHandler = (): void => {
      try {
        this.close();
      } catch {
        // An exit hook cannot delay process.exit; close already attempted every
        // synchronous restoration step before reporting a failure.
      }
    };
    this.#resizeHandler = (): void => {
      this.#emitResize();
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

    try {
      this.#installLifecycleHandlers();
      options.input.setRawMode(true);
      options.input.resume();
      options.output.write(TERMINAL_SEQUENCES.bracketedPasteOn);
      this.setMouseCapture(options.mouseCapture);
      this.#emitResize();
    } catch (error) {
      this.#restoreAfterSetupFailure();
      throw new Error("Console terminal setup failed", { cause: error });
    }
  }

  get mouseCapture(): boolean {
    return this.#mouseCapture;
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
    if (enabled === this.#mouseCapture) {
      return;
    }
    this.#output.write(
      enabled ? TERMINAL_SEQUENCES.mouseOn : TERMINAL_SEQUENCES.mouseOff,
    );
    this.#mouseCapture = enabled;
  }

  close(): void {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    const failures: unknown[] = [];
    this.#removeLifecycleHandlers();
    try {
      this.#output.write(TERMINAL_SEQUENCES.restore);
      this.#mouseCapture = false;
    } catch (error) {
      failures.push(error);
    }
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
    if (failures.length > 0) {
      throw new AggregateError(failures, "Console terminal restoration failed");
    }
  }

  #emitResize(): void {
    if (this.#closed || this.#onResize === undefined) {
      return;
    }
    const dimensions = this.dimensions;
    const key = `${dimensions.columns}x${dimensions.rows}`;
    if (key === this.#lastDimensions) {
      return;
    }
    this.#lastDimensions = key;
    this.#onResize(dimensions);
  }

  #installLifecycleHandlers(): void {
    for (const signal of RESTORED_SIGNALS) {
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
    this.#mouseCapture = false;
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

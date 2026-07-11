export const TERMINAL_SEQUENCES = Object.freeze({
  bracketedPasteOn: "\u001b[?2004h",
  mouseOn: "\u001b[?1002h\u001b[?1006h",
  restore: "\u001b[?1006l\u001b[?1002l\u001b[?2004l",
} as const);

const RESTORED_SIGNALS = ["SIGINT", "SIGHUP", "SIGTERM"] as const;
type RestoredSignal = (typeof RESTORED_SIGNALS)[number];

export type TerminalSessionOptions = Readonly<{
  input: NodeJS.ReadStream;
  output: NodeJS.WriteStream;
  mouseCapture: boolean;
  signalTarget: NodeJS.Process;
  onSignal: (signal: RestoredSignal) => void;
}>;

export class TerminalSession {
  readonly #input: NodeJS.ReadStream;
  readonly #output: NodeJS.WriteStream;
  readonly #signalTarget: NodeJS.Process;
  readonly #onSignal: (signal: RestoredSignal) => void;
  readonly #previousRaw: boolean;
  readonly #wasFlowing: boolean;
  readonly #handlers = new Map<RestoredSignal, () => void>();
  #closed = false;

  constructor(options: TerminalSessionOptions) {
    this.#input = options.input;
    this.#output = options.output;
    this.#signalTarget = options.signalTarget;
    this.#onSignal = options.onSignal;
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
      this.#installSignalHandlers();
      options.input.setRawMode(true);
      options.input.resume();
      options.output.write(TERMINAL_SEQUENCES.bracketedPasteOn);
      if (options.mouseCapture) {
        options.output.write(TERMINAL_SEQUENCES.mouseOn);
      }
    } catch (error) {
      this.#restoreAfterSetupFailure();
      throw new Error("Console terminal setup failed", { cause: error });
    }
  }

  close(): void {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    const failures: unknown[] = [];
    this.#removeSignalHandlers();
    try {
      this.#output.write(TERMINAL_SEQUENCES.restore);
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

  #installSignalHandlers(): void {
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
  }

  #removeSignalHandlers(): void {
    for (const [signal, handler] of this.#handlers) {
      this.#signalTarget.removeListener(signal, handler);
    }
    this.#handlers.clear();
  }

  #restoreAfterSetupFailure(): void {
    this.#removeSignalHandlers();
    try {
      this.#output.write(TERMINAL_SEQUENCES.restore);
    } catch {
      // The input mode restoration below remains mandatory even if output died.
    }
    try {
      this.#input.setRawMode?.(this.#previousRaw);
    } catch {
      // Constructor reports the setup failure after every restoration attempt.
    }
    if (this.#wasFlowing) {
      this.#input.resume();
    } else {
      this.#input.pause();
    }
    this.#closed = true;
  }
}

export async function withTerminalSession<T>(
  options: TerminalSessionOptions,
  work: () => Promise<T>,
): Promise<T> {
  const session = new TerminalSession(options);
  try {
    const result = await work();
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

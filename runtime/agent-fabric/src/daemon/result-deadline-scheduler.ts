export type ResultDeadlinePassIdentity = Readonly<{
  daemonInstanceGeneration: number;
  passGeneration: number;
}>;

type ResultDeadlineSchedulerOptions = Readonly<{
  intervalMs: number;
  daemonInstanceGeneration: number;
  pass(input: ResultDeadlinePassIdentity): void | Promise<void>;
}>;

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
  return value;
}

export class ResultDeadlineScheduler {
  readonly #options: ResultDeadlineSchedulerOptions;
  readonly #intervalMs: number;
  readonly #daemonInstanceGeneration: number;
  #passGeneration = 0;
  #timer: NodeJS.Timeout | undefined;
  #running: Promise<void> | undefined;
  #closed = false;

  constructor(options: ResultDeadlineSchedulerOptions) {
    this.#options = options;
    this.#intervalMs = positiveInteger(options.intervalMs, "result deadline intervalMs");
    this.#daemonInstanceGeneration = positiveInteger(
      options.daemonInstanceGeneration,
      "result deadline daemon generation",
    );
  }

  start(): void {
    if (this.#closed || this.#timer !== undefined) return;
    this.#timer = setInterval(() => {
      void this.#run().catch(() => undefined);
    }, this.#intervalMs);
    this.#timer.unref();
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    if (this.#timer !== undefined) clearInterval(this.#timer);
    this.#timer = undefined;
  }

  async #run(): Promise<void> {
    if (this.#closed || this.#running !== undefined) return await this.#running;
    const candidateGeneration = this.#passGeneration + 1;
    const input = {
      daemonInstanceGeneration: this.#daemonInstanceGeneration,
      passGeneration: candidateGeneration,
    };
    const running = Promise.resolve()
      .then(async () => await this.#options.pass(input))
      .then(() => { this.#passGeneration = candidateGeneration; });
    this.#running = running;
    try {
      await running;
    } finally {
      if (this.#running === running) this.#running = undefined;
    }
  }
}

import type { IdleStopResult } from "./global-liveness.js";

export type IdleShutdownReason = "operator-detach" | "attachment-expiry-sweep";

type IdleShutdownSchedulerOptions = Readonly<{
  graceMs: number;
  sweepMs: number;
  attempt(input: Readonly<{ actionId: string; reason: IdleShutdownReason }>): Promise<IdleStopResult>;
  onStopped(result: Extract<IdleStopResult, { state: "stopped" }>): Promise<void>;
}>;

function positiveDuration(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`${label} must be a positive safe integer`);
  return value;
}

export class IdleShutdownScheduler {
  readonly #options: IdleShutdownSchedulerOptions;
  readonly #graceMs: number;
  readonly #sweepMs: number;
  #generation = 0;
  #scheduled: NodeJS.Timeout | undefined;
  #sweep: NodeJS.Timeout | undefined;
  #running: Promise<void> | undefined;
  #closed = false;

  constructor(options: IdleShutdownSchedulerOptions) {
    this.#options = options;
    this.#graceMs = positiveDuration(options.graceMs, "idle shutdown graceMs");
    this.#sweepMs = positiveDuration(options.sweepMs, "idle shutdown sweepMs");
  }

  start(): void {
    if (this.#closed || this.#sweep !== undefined) return;
    this.#sweep = setInterval(() => {
      void this.#run("attachment-expiry-sweep").catch(() => undefined);
    }, this.#sweepMs);
    this.#sweep.unref();
  }

  schedule(reason: Extract<IdleShutdownReason, "operator-detach">): void {
    if (this.#closed || this.#scheduled !== undefined) return;
    this.#scheduled = setTimeout(() => {
      this.#scheduled = undefined;
      void this.#run(reason).catch(() => undefined);
    }, this.#graceMs);
    this.#scheduled.unref();
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    if (this.#scheduled !== undefined) clearTimeout(this.#scheduled);
    if (this.#sweep !== undefined) clearInterval(this.#sweep);
    this.#scheduled = undefined;
    this.#sweep = undefined;
  }

  async #run(reason: IdleShutdownReason): Promise<void> {
    if (this.#closed || this.#running !== undefined) return await this.#running;
    const actionId = `idle-stop:${reason}:${String(++this.#generation)}`;
    const running = (async () => {
      const result = await this.#options.attempt({ actionId, reason });
      if (result.state !== "stopped") return;
      try {
        await this.#options.onStopped(result);
      } finally {
        this.close();
      }
    })();
    this.#running = running;
    try {
      await running;
    } finally {
      this.#running = undefined;
    }
  }
}

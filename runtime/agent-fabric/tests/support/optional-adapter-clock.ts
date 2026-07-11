type Sleeper = {
  dueAt: number;
  resolve: () => void;
};

export class OptionalAdapterClock {
  #milliseconds = 0;
  #sleepers: Sleeper[] = [];

  now = (): number => this.#milliseconds;

  sleep = (milliseconds: number): Promise<void> =>
    new Promise((resolve) => {
      this.#sleepers.push({ dueAt: this.#milliseconds + milliseconds, resolve });
    });

  advance(milliseconds: number): void {
    this.#milliseconds += milliseconds;
    const ready = this.#sleepers.filter((sleeper) => sleeper.dueAt <= this.#milliseconds);
    this.#sleepers = this.#sleepers.filter((sleeper) => sleeper.dueAt > this.#milliseconds);
    for (const sleeper of ready) {
      sleeper.resolve();
    }
  }
}

export async function flushOptionalLeg(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise<void>((resolve) => setImmediate(resolve));
}

export async function advanceOptionalLeg(
  clock: OptionalAdapterClock,
  milliseconds: number,
): Promise<void> {
  clock.advance(milliseconds);
  await flushOptionalLeg();
}

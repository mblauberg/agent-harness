export class ManualClock {
  #milliseconds: number;

  constructor(iso = "2026-07-10T00:00:00.000Z") {
    this.#milliseconds = Date.parse(iso);
  }

  now = (): Date => new Date(this.#milliseconds);

  advance(milliseconds: number): void {
    this.#milliseconds += milliseconds;
  }
}

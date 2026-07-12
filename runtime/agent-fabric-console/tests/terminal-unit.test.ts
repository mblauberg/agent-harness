import { EventEmitter } from "node:events";

import { describe, expect, it } from "vitest";

import { TerminalSession } from "../src/terminal.js";

class FakeInput extends EventEmitter {
  readonly isTTY = true;
  isRaw = false;
  readableFlowing: boolean | null = false;

  setRawMode(enabled: boolean): this {
    if (!enabled) {
      throw new Error("raw restore failed");
    }
    this.isRaw = enabled;
    return this;
  }

  resume(): this {
    this.readableFlowing = true;
    return this;
  }

  pause(): this {
    throw new Error("flow restore failed");
  }
}

class FakeOutput extends EventEmitter {
  readonly isTTY = true;
  readonly columns = 80;
  readonly rows = 24;

  write(value: string): boolean {
    if (value.includes("?2004l")) {
      throw new Error("mode restore failed");
    }
    return true;
  }
}

describe("terminal teardown failures", () => {
  it("attempts every restoration step, aggregates failures, and stays idempotent", () => {
    const session = new TerminalSession({
      input: new FakeInput(),
      output: new FakeOutput(),
      mouseCapture: false,
      signalTarget: new EventEmitter(),
      onSignal: () => {},
    });
    let failure: unknown;
    try {
      session.close();
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(AggregateError);
    if (failure instanceof AggregateError) {
      expect(failure.errors).toHaveLength(3);
    }
    expect(() => session.close()).not.toThrow();
  });
});

import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

import {
  TERMINAL_SEQUENCES,
  TerminalSession,
  type TerminalDimensions,
} from "../src/terminal.js";

class FakeInput {
  readonly isTTY = true;
  isRaw = false;
  readableFlowing: boolean | null = false;
  readonly rawCalls: boolean[] = [];

  setRawMode(enabled: boolean): this {
    this.rawCalls.push(enabled);
    this.isRaw = enabled;
    return this;
  }

  resume(): this {
    this.readableFlowing = true;
    return this;
  }

  pause(): this {
    this.readableFlowing = false;
    return this;
  }
}

class FakeOutput extends EventEmitter {
  readonly isTTY = true;
  columns = 80;
  rows = 24;
  transcript = "";

  write(value: string): boolean {
    this.transcript += value;
    return true;
  }
}

describe("advanced terminal lifecycle", () => {
  it("owns alternate screen, cursor, paste and selection-friendly mouse modes", () => {
    const input = new FakeInput();
    const output = new FakeOutput();
    const session = new TerminalSession({
      input,
      output,
      mouseCapture: false,
      signalTarget: new EventEmitter(),
      onSignal: () => {},
    });

    expect(output.transcript).toContain(TERMINAL_SEQUENCES.enter);
    expect(output.transcript).not.toContain(TERMINAL_SEQUENCES.mouseOn);
    session.setEditorActive(true);
    session.setEditorActive(true);
    session.setEditorActive(false);
    session.close();

    expect(output.transcript.match(/\u001b\[\?25h/g)).toHaveLength(2);
    expect(output.transcript).toContain(TERMINAL_SEQUENCES.restore);
    expect(output.transcript.indexOf(TERMINAL_SEQUENCES.alternateScreenOn)).toBeLessThan(
      output.transcript.lastIndexOf(TERMINAL_SEQUENCES.alternateScreenOff),
    );
  });

  it("restores before suspend, then re-enters and repaints on resume", () => {
    const input = new FakeInput();
    const output = new FakeOutput();
    const signals = new EventEmitter();
    const onSuspend = vi.fn();
    const onResume = vi.fn();
    const onResize = vi.fn();
    const session = new TerminalSession({
      input,
      output,
      mouseCapture: true,
      signalTarget: signals,
      onSignal: () => {},
      onSuspend,
      onResume,
      onResize,
    });
    const beforeSuspend = output.transcript.length;

    signals.emit("SIGTSTP");

    expect(onSuspend).toHaveBeenCalledTimes(1);
    expect(output.transcript.slice(beforeSuspend)).toContain(
      TERMINAL_SEQUENCES.restore,
    );
    expect(input.isRaw).toBe(false);

    const beforeResume = output.transcript.length;
    output.columns = 100;
    output.rows = 30;
    signals.emit("SIGCONT");

    expect(output.transcript.slice(beforeResume)).toContain(
      TERMINAL_SEQUENCES.enter,
    );
    expect(output.transcript.slice(beforeResume)).toContain(
      TERMINAL_SEQUENCES.mouseOn,
    );
    expect(input.isRaw).toBe(true);
    expect(onResume).toHaveBeenCalledTimes(1);
    expect(onResize).toHaveBeenLastCalledWith({ columns: 100, rows: 30 });
    session.close();
  });

  it("coalesces resize bursts and emits the final authoritative dimensions", () => {
    const input = new FakeInput();
    const output = new FakeOutput();
    const scheduled: Array<() => void> = [];
    const dimensions: TerminalDimensions[] = [];
    const session = new TerminalSession({
      input,
      output,
      mouseCapture: false,
      signalTarget: new EventEmitter(),
      onSignal: () => {},
      onResize: (value) => dimensions.push(value),
      scheduleResize: (callback) => {
        scheduled.push(callback);
        return callback;
      },
      cancelResize: (callback) => {
        const index = scheduled.indexOf(callback as () => void);
        if (index >= 0) scheduled.splice(index, 1);
      },
    });
    expect(dimensions).toStrictEqual([{ columns: 80, rows: 24 }]);

    output.columns = 90;
    output.rows = 25;
    output.emit("resize");
    output.columns = 100;
    output.rows = 30;
    output.emit("resize");
    output.columns = 120;
    output.rows = 40;
    output.emit("resize");

    expect(scheduled).toHaveLength(1);
    expect(dimensions).toHaveLength(1);
    scheduled.shift()?.();
    expect(dimensions).toStrictEqual([
      { columns: 80, rows: 24 },
      { columns: 120, rows: 40 },
    ]);
    session.close();
  });
});

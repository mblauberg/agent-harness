import { PassThrough, Writable } from "node:stream";

import { describe, expect, it, vi } from "vitest";

import {
  BoundedNdjsonReader,
  BoundedNdjsonWriter,
  NdjsonProtocolError,
} from "../../src/transport/bounded-ndjson.ts";

describe("bounded NDJSON", () => {
  it("frames split UTF-8 input without corrupting multibyte characters", async () => {
    const input = new PassThrough();
    const frames: string[] = [];
    const reader = new BoundedNdjsonReader(input, {
      maximumFrameBytes: 64,
      onFrame: (frame) => frames.push(frame),
    });
    const bytes = Buffer.from('{"word":"café"}\n');

    input.write(bytes.subarray(0, bytes.indexOf(0xc3) + 1));
    input.end(bytes.subarray(bytes.indexOf(0xc3) + 1));
    await reader.closed;

    expect(frames).toEqual(['{"word":"café"}']);
  });

  it("rejects a frame as soon as it exceeds the byte bound", async () => {
    const input = new PassThrough();
    const errors: NdjsonProtocolError[] = [];
    const reader = new BoundedNdjsonReader(input, {
      maximumFrameBytes: 4,
      onFrame: () => undefined,
      onError: (error) => errors.push(error),
    });

    input.end("12345");
    await reader.closed;

    expect(errors).toEqual([
      expect.objectContaining({ code: "NDJSON_FRAME_TOO_LARGE" }),
    ]);
  });

  it("waits for output backpressure before completing a write", async () => {
    let release: (() => void) | undefined;
    const output = new Writable({
      highWaterMark: 1,
      write(_chunk, _encoding, callback) {
        release = callback;
      },
    });
    const writer = new BoundedNdjsonWriter(output, { maximumFrameBytes: 64, maximumPendingWrites: 2 });
    const completed = vi.fn();
    const pending = writer.write({ ok: true }).then(completed);

    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(completed).not.toHaveBeenCalled();
    release?.();
    await pending;
    expect(completed).toHaveBeenCalledOnce();
  });

  it("rejects sustained output flooding instead of growing an unbounded promise tail", async () => {
    const callbacks: Array<(error?: Error | null) => void> = [];
    const output = new Writable({
      write(_chunk, _encoding, callback) { callbacks.push(callback); },
    });
    const writer = new BoundedNdjsonWriter(output, { maximumFrameBytes: 64, maximumPendingWrites: 2 });
    const first = writer.write({ id: 1 });
    const second = writer.write({ id: 2 });
    await expect(writer.write({ id: 3 })).rejects.toMatchObject({ code: "NDJSON_WRITE_OVERLOADED" });
    await new Promise<void>((resolve) => setImmediate(resolve));
    callbacks.shift()?.();
    await new Promise<void>((resolve) => setImmediate(resolve));
    callbacks.shift()?.();
    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);
  });
});

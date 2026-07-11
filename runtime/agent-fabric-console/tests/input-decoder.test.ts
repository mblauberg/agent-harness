import { describe, expect, it } from "vitest";

import * as Console from "../src/index.js";

describe("bounded terminal input decoding", () => {
  it("decodes keyboard and exact partial SGR 1006 mouse sequences", () => {
    const decoder = new Console.TerminalInputDecoder({
      maxPendingBytes: 48,
      maxPasteBytes: 64,
      maxChunkBytes: 128,
    });

    expect(decoder.push(Buffer.from("\r\u001b[A\u001bm"))).toStrictEqual([
      { kind: "key", key: "enter" },
      { kind: "key", key: "up" },
      { kind: "key", key: "alt-m" },
    ]);
    expect(decoder.push(Buffer.from("\u001b[<0;12"))).toStrictEqual([]);
    expect(decoder.push(Buffer.from(";7M"))).toStrictEqual([
      {
        kind: "mouse",
        phase: "press",
        button: "left",
        x: 12,
        y: 7,
        modifiers: { shift: false, alt: false, ctrl: false },
      },
    ]);
    expect(decoder.push(Buffer.from("\u001b[<0;12;7m\u001b[<64;12;7M"))).toStrictEqual([
      {
        kind: "mouse",
        phase: "release",
        button: "left",
        x: 12,
        y: 7,
        modifiers: { shift: false, alt: false, ctrl: false },
      },
      {
        kind: "mouse",
        phase: "wheel",
        button: "wheel-up",
        x: 12,
        y: 7,
        modifiers: { shift: false, alt: false, ctrl: false },
      },
    ]);
  });

  it("rejects malformed, control-string, and oversized input without interpreting suffixes", () => {
    const decoder = new Console.TerminalInputDecoder({
      maxPendingBytes: 12,
      maxPasteBytes: 32,
      maxChunkBytes: 32,
    });

    expect(decoder.push(Buffer.from("\u001b[<0;0;7M"))).toStrictEqual([
      { kind: "rejected", reason: "malformed-sequence" },
    ]);
    expect(
      decoder.push(Buffer.from("\u001b[<0;123456789012345;7M")),
    ).toStrictEqual([{ kind: "rejected", reason: "sequence-overflow" }]);
    expect(
      decoder.push(Buffer.from("\u001b]0;accept\u0007\u001bPconfirm\u001b\\")),
    ).toStrictEqual([
      { kind: "rejected", reason: "malformed-sequence" },
      { kind: "rejected", reason: "malformed-sequence" },
    ]);
    expect(decoder.push(Buffer.from([0x9b]))).toStrictEqual([
      { kind: "key", key: "text", text: "\uFFFD" },
    ]);
    expect(decoder.push(Buffer.alloc(33, 0x61))).toStrictEqual([
      { kind: "rejected", reason: "chunk-overflow" },
    ]);
    expect(decoder.end()).toStrictEqual([]);
  });

  it("routes exact bounded bracketed paste as one inert text event", () => {
    const decoder = new Console.TerminalInputDecoder({
      maxPendingBytes: 32,
      maxPasteBytes: 64,
      maxChunkBytes: 128,
    });

    expect(decoder.push(Buffer.from("\u001b[20"))).toStrictEqual([]);
    expect(
      decoder.push(
        Buffer.from("0~q\n\rconfirm\u001b[31m\u0003\u001b[20"),
      ),
    ).toStrictEqual([]);
    expect(decoder.push(Buffer.from("1~"))).toStrictEqual([
      {
        kind: "paste",
        text: "q\n\rconfirm\u001b[31m\u0003",
      },
    ]);

    const overflow = new Console.TerminalInputDecoder({
      maxPendingBytes: 32,
      maxPasteBytes: 8,
      maxChunkBytes: 64,
    });
    expect(
      overflow.push(Buffer.from("\u001b[200~123456789\u001b[201~")),
    ).toStrictEqual([{ kind: "rejected", reason: "paste-overflow" }]);
  });

  it("drops partial UTF-8 state when an oversized chunk is quarantined", () => {
    const decoder = new Console.TerminalInputDecoder({
      maxPendingBytes: 16,
      maxPasteBytes: 16,
      maxChunkBytes: 4,
    });

    expect(decoder.push(Buffer.from([0xe2]))).toStrictEqual([]);
    expect(decoder.push(Buffer.alloc(5, 0x61))).toStrictEqual([
      { kind: "rejected", reason: "chunk-overflow" },
    ]);
    expect(decoder.push(Buffer.from("A"))).toStrictEqual([
      { kind: "key", key: "text", text: "A" },
    ]);
  });
});

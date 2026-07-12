import { describe, expect, it } from "vitest";

import * as Console from "../src/index.js";

describe("bounded terminal input decoding", () => {
  it("preserves distinct printable key receipts inside one terminal chunk", () => {
    const decoder = new Console.TerminalInputDecoder();

    expect(decoder.push(Buffer.from("13"))).toStrictEqual([
      { kind: "key", key: "text", text: "1" },
      { kind: "key", key: "text", text: "3" },
    ]);
  });

  it("decodes paging and boundary navigation keys", () => {
    const decoder = new Console.TerminalInputDecoder();
    expect(
      decoder.push(Buffer.from("\u001b[5~\u001b[6~\u001b[H\u001b[F")),
    ).toStrictEqual([
      { kind: "key", key: "page-up" },
      { kind: "key", key: "page-down" },
      { kind: "key", key: "home" },
      { kind: "key", key: "end" },
    ]);
  });

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
    expect(decoder.push(Buffer.from("1~"))).toStrictEqual([]);
    expect(decoder.flushPasteBoundary()).toStrictEqual([
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
    ).toStrictEqual([]);
    expect(overflow.flushPasteBoundary()).toStrictEqual([
      { kind: "rejected", reason: "paste-overflow" },
    ]);
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

  it("flushes lone and partial Escape ambiguity without ending the decoder", () => {
    let now = 1_000;
    const decoder = new Console.TerminalInputDecoder({
      escapeTimeoutMs: 25,
      now: () => now,
    });

    expect(decoder.push(Buffer.from("\u001b"))).toStrictEqual([]);
    now += 24;
    expect(decoder.flushTimedOut()).toStrictEqual([]);
    now += 1;
    expect(decoder.flushTimedOut()).toStrictEqual([
      { kind: "key", key: "escape" },
    ]);
    expect(decoder.push(Buffer.from("a"))).toStrictEqual([
      { kind: "key", key: "text", text: "a" },
    ]);

    expect(decoder.push(Buffer.from("\u001b["))).toStrictEqual([]);
    now += 25;
    expect(decoder.flushTimedOut()).toStrictEqual([
      { kind: "rejected", reason: "malformed-sequence" },
    ]);
    expect(decoder.push(Buffer.from("b"))).toStrictEqual([]);
    expect(decoder.push(Buffer.from("c"))).toStrictEqual([
      { kind: "key", key: "text", text: "c" },
    ]);
  });

  it("fails safe when an oversized chunk interrupts paste or control quarantine", () => {
    for (const prefix of ["\u001b[200~paste", "\u001b]0;title"] as const) {
      const decoder = new Console.TerminalInputDecoder({
        maxChunkBytes: 4_096,
        maxPasteBytes: 8_192,
      });
      const initial = decoder.push(Buffer.from(prefix));
      if (prefix.startsWith("\u001b]")) {
        expect(initial).toStrictEqual([
          { kind: "rejected", reason: "malformed-sequence" },
        ]);
      } else {
        expect(initial).toStrictEqual([]);
      }
      expect(decoder.push(Buffer.alloc(4_097, 0x61))).toStrictEqual([
        { kind: "fatal", reason: "input-quarantine-lost" },
      ]);
      expect(
        decoder.push(Buffer.from("\u001b[201~\u0007accept\r")),
      ).toStrictEqual([]);
      expect(decoder.flushTimedOut(Number.MAX_SAFE_INTEGER)).toStrictEqual([]);
    }
  });

  it("closes only the final idle paste candidate and keeps burst suffixes inert", () => {
    let now = 5_000;
    const decoder = new Console.TerminalInputDecoder({
      maxChunkBytes: 256,
      maxPasteBytes: 256,
      pasteIdleTimeoutMs: 20,
      now: () => now,
    });

    expect(decoder.push(Buffer.from("\u001b[200~draft\u001b[201"))).toStrictEqual(
      [],
    );
    expect(
      decoder.push(Buffer.from("~embedded\u001b[20")),
    ).toStrictEqual([]);
    expect(decoder.push(Buffer.from("1~a\rconfirm"))).toStrictEqual([]);
    now += 19;
    expect(decoder.flushTimedOut()).toStrictEqual([]);
    now += 1;
    expect(decoder.flushTimedOut()).toStrictEqual([
      {
        kind: "paste",
        text: "draft\u001b[201~embeddeda\rconfirm",
      },
    ]);
    expect(decoder.push(Buffer.from("b"))).toStrictEqual([
      { kind: "key", key: "text", text: "b" },
    ]);
  });

  it("fatal-detaches instead of trapping an unresynchronisable quarantine", () => {
    for (const prefix of ["\u001b[200~unterminated", "\u001b]0;unterminated"] as const) {
      let now = 9_000;
      const decoder = new Console.TerminalInputDecoder({
        quarantineTimeoutMs: 100,
        now: () => now,
      });
      decoder.push(Buffer.from(prefix));
      now += 99;
      expect(decoder.flushTimedOut()).toStrictEqual([]);
      now += 1;
      expect(decoder.flushTimedOut()).toStrictEqual([
        { kind: "fatal", reason: "input-quarantine-lost" },
      ]);
      expect(decoder.push(Buffer.from("accept\r"))).toStrictEqual([]);
    }
  });
});

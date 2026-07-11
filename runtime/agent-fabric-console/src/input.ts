import { StringDecoder } from "node:string_decoder";

export type InputModifiers = Readonly<{
  shift: boolean;
  alt: boolean;
  ctrl: boolean;
}>;

export type KeyInputEvent = Readonly<{
  kind: "key";
  key:
    | "enter"
    | "up"
    | "down"
    | "left"
    | "right"
    | "page-up"
    | "page-down"
    | "home"
    | "end"
    | "tab"
    | "shift-tab"
    | "escape"
    | "backspace"
    | "space"
    | "ctrl-c"
    | "alt-m"
    | `alt-${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}`
    | "text";
  text?: string;
}>;

export type MouseInputEvent = Readonly<{
  kind: "mouse";
  phase: "press" | "release" | "drag" | "wheel";
  button: "left" | "middle" | "right" | "wheel-up" | "wheel-down";
  x: number;
  y: number;
  modifiers: InputModifiers;
}>;

export type RejectedInputEvent = Readonly<{
  kind: "rejected";
  reason:
    | "malformed-sequence"
    | "sequence-overflow"
    | "chunk-overflow"
    | "paste-overflow";
}>;

export type PasteInputEvent = Readonly<{
  kind: "paste";
  text: string;
}>;

export type FatalInputEvent = Readonly<{
  kind: "fatal";
  reason: "input-quarantine-lost";
}>;

export type TerminalInputEvent =
  | KeyInputEvent
  | MouseInputEvent
  | PasteInputEvent
  | FatalInputEvent
  | RejectedInputEvent;

export type TerminalInputLimits = Readonly<{
  maxPendingBytes: number;
  maxPasteBytes: number;
  maxChunkBytes: number;
}>;

export type TerminalInputOptions = Partial<TerminalInputLimits> &
  Readonly<{
    escapeTimeoutMs?: number;
    pasteIdleTimeoutMs?: number;
    quarantineTimeoutMs?: number;
    now?: () => number;
  }>;

const DEFAULT_LIMITS: TerminalInputLimits = Object.freeze({
  maxPendingBytes: 64,
  maxPasteBytes: 16_384,
  maxChunkBytes: 4_096,
});

const PASTE_START = "\u001b[200~";
const PASTE_END = Buffer.from("\u001b[201~", "ascii");

const KEY_SEQUENCES: Readonly<Record<string, KeyInputEvent["key"]>> =
  Object.freeze({
    "\u001b[A": "up",
    "\u001b[B": "down",
    "\u001b[C": "right",
    "\u001b[D": "left",
    "\u001b[5~": "page-up",
    "\u001b[6~": "page-down",
    "\u001b[H": "home",
    "\u001b[F": "end",
    "\u001b[1~": "home",
    "\u001b[4~": "end",
    "\u001b[Z": "shift-tab",
    "\u001bm": "alt-m",
    "\u001bM": "alt-m",
    "\u001b1": "alt-1",
    "\u001b2": "alt-2",
    "\u001b3": "alt-3",
    "\u001b4": "alt-4",
    "\u001b5": "alt-5",
    "\u001b6": "alt-6",
    "\u001b7": "alt-7",
    "\u001b8": "alt-8",
  });

function validLimit(value: number, fallback: number): number {
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function inputLimits(limits: Partial<TerminalInputLimits>): TerminalInputLimits {
  return {
    maxPendingBytes: validLimit(
      limits.maxPendingBytes ?? DEFAULT_LIMITS.maxPendingBytes,
      DEFAULT_LIMITS.maxPendingBytes,
    ),
    maxPasteBytes: validLimit(
      limits.maxPasteBytes ?? DEFAULT_LIMITS.maxPasteBytes,
      DEFAULT_LIMITS.maxPasteBytes,
    ),
    maxChunkBytes: validLimit(
      limits.maxChunkBytes ?? DEFAULT_LIMITS.maxChunkBytes,
      DEFAULT_LIMITS.maxChunkBytes,
    ),
  };
}

function decodeMouse(sequence: string): MouseInputEvent | undefined {
  const match = /^\u001b\[<(\d{1,3});(\d{1,5});(\d{1,5})([Mm])$/.exec(
    sequence,
  );
  if (match === null) {
    return undefined;
  }
  const codeText = match[1];
  const xText = match[2];
  const yText = match[3];
  const terminator = match[4];
  if (
    codeText === undefined ||
    xText === undefined ||
    yText === undefined ||
    terminator === undefined
  ) {
    return undefined;
  }
  const code = Number(codeText);
  const x = Number(xText);
  const y = Number(yText);
  if (code > 95 || x < 1 || y < 1 || x > 65_535 || y > 65_535) {
    return undefined;
  }

  const modifiers: InputModifiers = {
    shift: (code & 4) !== 0,
    alt: (code & 8) !== 0,
    ctrl: (code & 16) !== 0,
  };
  const base = code & ~(4 | 8 | 16 | 32);
  if (base === 64 || base === 65) {
    if (terminator !== "M" || (code & 32) !== 0) {
      return undefined;
    }
    return {
      kind: "mouse",
      phase: "wheel",
      button: base === 64 ? "wheel-up" : "wheel-down",
      x,
      y,
      modifiers,
    };
  }

  const button =
    base === 0
      ? "left"
      : base === 1
        ? "middle"
        : base === 2
          ? "right"
          : undefined;
  if (button === undefined) {
    return undefined;
  }
  const motion = (code & 32) !== 0;
  if (terminator === "m" && motion) {
    return undefined;
  }
  return {
    kind: "mouse",
    phase: terminator === "m" ? "release" : motion ? "drag" : "press",
    button,
    x,
    y,
    modifiers,
  };
}

function decodeEscape(sequence: string): TerminalInputEvent {
  const key = KEY_SEQUENCES[sequence];
  if (key !== undefined) {
    return { kind: "key", key };
  }
  const mouse = decodeMouse(sequence);
  return mouse ?? { kind: "rejected", reason: "malformed-sequence" };
}

export class TerminalInputDecoder {
  readonly #limits: TerminalInputLimits;
  #pendingEscape: number[] = [];
  #discardEscape = false;
  #discardControlString: "bel-or-st" | "st" | null = null;
  #controlStringSawEscape = false;
  #inPaste = false;
  #pasteBytes: number[] = [];
  #pasteEndMatch = 0;
  #pasteOverflow = false;
  #pasteCandidateStart: number | null = null;
  #pasteCandidateSeen = false;
  #textDecoder = new StringDecoder("utf8");
  readonly #escapeTimeoutMs: number;
  readonly #pasteIdleTimeoutMs: number;
  readonly #quarantineTimeoutMs: number;
  readonly #now: () => number;
  #pendingEscapeAt: number | null = null;
  #lastInputAt: number | null = null;
  #fatal = false;

  constructor(options: TerminalInputOptions = {}) {
    this.#limits = inputLimits(options);
    this.#escapeTimeoutMs = validLimit(options.escapeTimeoutMs ?? 25, 25);
    this.#pasteIdleTimeoutMs = validLimit(
      options.pasteIdleTimeoutMs ?? 25,
      25,
    );
    this.#quarantineTimeoutMs = validLimit(
      options.quarantineTimeoutMs ?? 1_000,
      1_000,
    );
    this.#now = options.now ?? Date.now;
  }

  push(input: Uint8Array): readonly TerminalInputEvent[] {
    if (this.#fatal) {
      return [];
    }
    const receivedAt = this.#now();
    this.#lastInputAt = receivedAt;
    if (input.byteLength > this.#limits.maxChunkBytes) {
      if (
        this.#inPaste ||
        this.#discardControlString !== null ||
        this.#discardEscape ||
        this.#pendingEscape.length > 0
      ) {
        this.#enterFatalState();
        return [{ kind: "fatal", reason: "input-quarantine-lost" }];
      }
      this.#textDecoder = new StringDecoder("utf8");
      return [{ kind: "rejected", reason: "chunk-overflow" }];
    }

    const events: TerminalInputEvent[] = [];
    const plainBytes: number[] = [];
    const flushPlain = (): void => {
      if (plainBytes.length === 0) {
        return;
      }
      const text = this.#textDecoder.write(Buffer.from(plainBytes));
      plainBytes.length = 0;
      if (text.length > 0) {
        events.push({ kind: "key", key: "text", text });
      }
    };

    for (const byte of input) {
      if (this.#inPaste) {
        this.#consumePasteByte(byte);
        continue;
      }
      if (this.#discardControlString !== null) {
        if (
          this.#discardControlString === "bel-or-st" &&
          byte === 0x07
        ) {
          this.#discardControlString = null;
          this.#controlStringSawEscape = false;
        } else if (this.#controlStringSawEscape && byte === 0x5c) {
          this.#discardControlString = null;
          this.#controlStringSawEscape = false;
        } else {
          this.#controlStringSawEscape = byte === 0x1b;
        }
        continue;
      }
      if (this.#discardEscape) {
        if (byte >= 0x40 && byte <= 0x7e) {
          this.#discardEscape = false;
        }
        continue;
      }
      if (this.#pendingEscape.length > 0) {
        this.#pendingEscape.push(byte);
        if (this.#pendingEscape.length > this.#limits.maxPendingBytes) {
          events.push({ kind: "rejected", reason: "sequence-overflow" });
          this.#pendingEscape = [];
          this.#pendingEscapeAt = null;
          this.#discardEscape = !(byte >= 0x40 && byte <= 0x7e);
          continue;
        }
        const sequence = String.fromCharCode(...this.#pendingEscape);
        const second = this.#pendingEscape[1];
        if (
          this.#pendingEscape.length === 2 &&
          (second === 0x5d ||
            second === 0x50 ||
            second === 0x5e ||
            second === 0x5f)
        ) {
          events.push({ kind: "rejected", reason: "malformed-sequence" });
          this.#pendingEscape = [];
          this.#pendingEscapeAt = null;
          this.#discardControlString = second === 0x5d ? "bel-or-st" : "st";
          this.#controlStringSawEscape = false;
          continue;
        }
        if (second !== 0x5b) {
          events.push(decodeEscape(sequence));
          this.#pendingEscape = [];
          this.#pendingEscapeAt = null;
          continue;
        }
        if (
          this.#pendingEscape.length > 2 &&
          byte >= 0x40 &&
          byte <= 0x7e
        ) {
          if (sequence === PASTE_START) {
            this.#inPaste = true;
            this.#pasteBytes = [];
            this.#pasteEndMatch = 0;
            this.#pasteOverflow = false;
            this.#pasteCandidateStart = null;
            this.#pasteCandidateSeen = false;
          } else {
            events.push(decodeEscape(sequence));
          }
          this.#pendingEscape = [];
          this.#pendingEscapeAt = null;
        }
        continue;
      }

      if (byte === 0x1b) {
        flushPlain();
        this.#pendingEscape = [byte];
        this.#pendingEscapeAt = receivedAt;
      } else if (byte === 0x0d || byte === 0x0a) {
        flushPlain();
        events.push({ kind: "key", key: "enter" });
      } else if (byte === 0x09) {
        flushPlain();
        events.push({ kind: "key", key: "tab" });
      } else if (byte === 0x7f || byte === 0x08) {
        flushPlain();
        events.push({ kind: "key", key: "backspace" });
      } else if (byte === 0x03) {
        flushPlain();
        events.push({ kind: "key", key: "ctrl-c" });
      } else if (byte === 0x20) {
        flushPlain();
        events.push({ kind: "key", key: "space" });
      } else if (byte >= 0x20) {
        plainBytes.push(byte);
      } else {
        flushPlain();
        events.push({ kind: "rejected", reason: "malformed-sequence" });
      }
    }
    flushPlain();
    return events;
  }

  flushTimedOut(now = this.#now()): readonly TerminalInputEvent[] {
    if (this.#fatal) {
      return [];
    }
    if (
      this.#inPaste &&
      this.#pasteCandidateSeen &&
      this.#lastInputAt !== null &&
      now - this.#lastInputAt >= this.#pasteIdleTimeoutMs
    ) {
      return this.flushPasteBoundary();
    }
    if (
      this.#lastInputAt !== null &&
      now - this.#lastInputAt >= this.#quarantineTimeoutMs &&
      (this.#inPaste ||
        this.#discardControlString !== null ||
        this.#discardEscape)
    ) {
      this.#enterFatalState();
      return [{ kind: "fatal", reason: "input-quarantine-lost" }];
    }
    if (
      this.#pendingEscapeAt === null ||
      now - this.#pendingEscapeAt < this.#escapeTimeoutMs
    ) {
      return [];
    }
    if (this.#pendingEscape.length === 1) {
      this.#pendingEscape = [];
      this.#pendingEscapeAt = null;
      return [{ kind: "key", key: "escape" }];
    }
    if (this.#pendingEscape.length > 1) {
      this.#pendingEscape = [];
      this.#pendingEscapeAt = null;
      this.#discardEscape = true;
      return [{ kind: "rejected", reason: "malformed-sequence" }];
    }
    this.#pendingEscapeAt = null;
    return [];
  }

  flushPasteBoundary(): readonly TerminalInputEvent[] {
    if (this.#fatal || !this.#inPaste || !this.#pasteCandidateSeen) {
      return [];
    }
    if (this.#pasteOverflow) {
      this.#resetPaste();
      return [{ kind: "rejected", reason: "paste-overflow" }];
    }
    const candidateStart = this.#pasteCandidateStart;
    if (candidateStart === null) {
      this.#enterFatalState();
      return [{ kind: "fatal", reason: "input-quarantine-lost" }];
    }
    const content = Buffer.from([
      ...this.#pasteBytes.slice(0, candidateStart),
      ...this.#pasteBytes.slice(candidateStart + PASTE_END.length),
    ]).toString("utf8");
    this.#resetPaste();
    return [{ kind: "paste", text: content }];
  }

  end(): readonly TerminalInputEvent[] {
    if (this.#fatal) {
      return [];
    }
    const events: TerminalInputEvent[] = [];
    if (this.#inPaste) {
      const paste = this.flushPasteBoundary();
      if (paste.length > 0) {
        events.push(...paste);
      } else {
        events.push({
          kind: "rejected",
          reason: this.#pasteOverflow
            ? "paste-overflow"
            : "malformed-sequence",
        });
      }
    } else if (this.#pendingEscape.length === 1) {
      events.push({ kind: "key", key: "escape" });
    } else if (
      this.#pendingEscape.length > 1 ||
      this.#discardEscape ||
      this.#discardControlString !== null
    ) {
      events.push({ kind: "rejected", reason: "malformed-sequence" });
    }
    const trailing = this.#textDecoder.end();
    if (trailing.length > 0) {
      events.push({ kind: "key", key: "text", text: trailing });
    }
    this.#resetSequence();
    this.#textDecoder = new StringDecoder("utf8");
    return events;
  }

  #consumePasteByte(byte: number): void {
    if (!this.#pasteOverflow) {
      this.#pasteBytes.push(byte);
    }

    const expected = PASTE_END[this.#pasteEndMatch];
    if (expected !== undefined && byte === expected) {
      this.#pasteEndMatch += 1;
    } else {
      this.#pasteEndMatch = byte === PASTE_END[0] ? 1 : 0;
    }

    if (this.#pasteEndMatch === PASTE_END.length) {
      this.#pasteCandidateSeen = true;
      if (!this.#pasteOverflow) {
        this.#pasteCandidateStart =
          this.#pasteBytes.length - PASTE_END.length;
      }
      this.#pasteEndMatch = 0;
    }

    if (
      !this.#pasteOverflow &&
      this.#pasteBytes.length -
        (this.#pasteCandidateStart === null ? 0 : PASTE_END.length) >
        this.#limits.maxPasteBytes
    ) {
      this.#pasteOverflow = true;
      this.#pasteBytes = [];
    }
  }

  #resetPaste(): void {
    this.#inPaste = false;
    this.#pasteBytes = [];
    this.#pasteEndMatch = 0;
    this.#pasteOverflow = false;
    this.#pasteCandidateStart = null;
    this.#pasteCandidateSeen = false;
  }

  #enterFatalState(): void {
    this.#fatal = true;
    this.#pendingEscape = [];
    this.#pendingEscapeAt = null;
    this.#discardEscape = false;
    this.#discardControlString = null;
    this.#controlStringSawEscape = false;
    this.#resetPaste();
    this.#textDecoder = new StringDecoder("utf8");
  }

  #resetSequence(): void {
    this.#pendingEscape = [];
    this.#pendingEscapeAt = null;
    this.#discardEscape = false;
    this.#discardControlString = null;
    this.#controlStringSawEscape = false;
    this.#resetPaste();
    this.#textDecoder = new StringDecoder("utf8");
  }
}

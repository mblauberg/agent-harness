import { randomBytes } from "node:crypto";
import { chmod, mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";

import type { EventsAfterResult, ObserverEvent } from "../core/contracts.js";

type EventSource = {
  eventsAfter(input: { cursor: number; limit: number }): Promise<EventsAfterResult>;
};

type CursorState = { version: 1; runId: string; cursor: number };
const OBSERVER_TIME_ZONE = "Australia/Brisbane";
const BRISBANE_TIMESTAMP = new Intl.DateTimeFormat("en-CA", {
  timeZone: OBSERVER_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function isCursorState(value: unknown, runId: string): value is CursorState {
  return typeof value === "object" && value !== null &&
    (value as CursorState).version === 1 && (value as CursorState).runId === runId &&
    Number.isSafeInteger((value as CursorState).cursor) && (value as CursorState).cursor >= 0;
}

function renderEvent(event: ObserverEvent): string {
  const summary = event.summary
    .replace(/[\u0000-\u001f\u007f-\u009f]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 240);
  const parts = Object.fromEntries(
    BRISBANE_TIMESTAMP.formatToParts(new Date(event.createdAt))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  const timestamp = `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
  return `${timestamp} AEST (UTC+10) #${event.cursor} ${summary}`;
}

/**
 * Projects events at least once. The cursor advances only after rendering
 * succeeds, so a crash after output but before checkpointing may replay the
 * last line after restart; an unrendered event is never skipped.
 */
export class DurableEventObserver {
  readonly #runId: string;
  readonly #cursorPath: string;
  readonly #source: EventSource;
  readonly #render: (line: string) => Promise<void>;
  #cursor: number | undefined;

  constructor(options: {
    runId: string;
    cursorPath: string;
    source: EventSource;
    render: (line: string) => Promise<void>;
  }) {
    this.#runId = options.runId;
    this.#cursorPath = options.cursorPath;
    this.#source = options.source;
    this.#render = options.render;
  }

  async #loadCursor(): Promise<number> {
    if (this.#cursor !== undefined) return this.#cursor;
    try {
      const value: unknown = JSON.parse(await readFile(this.#cursorPath, "utf8"));
      if (!isCursorState(value, this.#runId)) throw new Error("observer cursor state is invalid or belongs to another run");
      this.#cursor = value.cursor;
    } catch (error: unknown) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") this.#cursor = 0;
      else throw error;
    }
    return this.#cursor;
  }

  async #saveCursor(cursor: number): Promise<void> {
    const directory = dirname(this.#cursorPath);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(directory, 0o700);
    const temporary = `${this.#cursorPath}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`;
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(`${JSON.stringify({ version: 1, runId: this.#runId, cursor })}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await rename(temporary, this.#cursorPath);
      await chmod(this.#cursorPath, 0o600);
    } finally {
      await rm(temporary, { force: true });
    }
    this.#cursor = cursor;
  }

  async poll(limit = 100): Promise<{ events: ObserverEvent[]; rendered: number; cursor: number }> {
    let cursor = await this.#loadCursor();
    const page = await this.#source.eventsAfter({ cursor, limit });
    let rendered = 0;
    for (const event of page.events) {
      if (event.cursor <= cursor) continue;
      await this.#render(renderEvent(event));
      cursor = event.cursor;
      await this.#saveCursor(cursor);
      rendered += 1;
    }
    return { events: page.events, rendered, cursor };
  }
}

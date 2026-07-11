import { describe, expect, it } from "vitest";

import * as Console from "../src/index.js";

const projection: Console.ConsoleProjection = {
  project: ".agents",
  session: "session",
  run: "run",
  revision: 1n,
  freshness: "LIVE",
  age: "now",
  phase: "implement",
  owner: "chair",
  health: "HEALTHY",
  attentionCount: 1,
  runCount: 1,
  currentMilestone: "input",
  nextMilestone: "PTY",
  declaredCount: "T:2/3",
};

describe("one semantic input reducer", () => {
  it("maps keyboard and exact SGR mouse activation to the same region intent", () => {
    const frame = Console.renderConsoleFrame(
      projection,
      Console.createConsoleState(),
      { columns: 80, rows: 24 },
    );
    const accept = frame.hitRegions.find(({ id }) => id === "action:accept");
    expect(accept).toBeDefined();
    if (accept === undefined) {
      return;
    }
    const x = Math.floor((accept.rect.x1 + accept.rect.x2) / 2);
    const y = accept.rect.y1;
    const initial = Console.createConsoleState({
      focus: "actions",
      focusedRegionId: "action:accept",
      mouseCapture: true,
    });

    const keyboard = Console.reduceConsoleInput(
      initial,
      { kind: "key", key: "enter" },
      frame,
    );
    const press = Console.reduceConsoleInput(
      initial,
      {
        kind: "mouse",
        phase: "press",
        button: "left",
        x,
        y,
        modifiers: { shift: false, alt: false, ctrl: false },
      },
      frame,
    );
    const release = Console.reduceConsoleInput(
      press.state,
      {
        kind: "mouse",
        phase: "release",
        button: "left",
        x,
        y,
        modifiers: { shift: false, alt: false, ctrl: false },
      },
      frame,
    );

    expect(keyboard.intents).toStrictEqual([
      {
        kind: "activate-region",
        regionId: "action:accept",
        provenance: "keyboard",
      },
    ]);
    expect(release.intents).toStrictEqual([
      {
        kind: "activate-region",
        regionId: "action:accept",
        provenance: "mouse",
      },
    ]);
    expect(release.state.pressedRegionId).toBeNull();
  });

  it("uses the same local splitter reducer for keyboard and SGR drag", () => {
    const initial = Console.createConsoleState({
      focus: "splitter",
      focusedRegionId: "splitter",
      mouseCapture: true,
    });
    const frame = Console.renderConsoleFrame(projection, initial, {
      columns: 80,
      rows: 24,
    });
    const splitter = frame.hitRegions.find(({ id }) => id === "splitter");
    expect(splitter?.rect.y1).toBe(14);
    if (splitter === undefined) {
      return;
    }

    const keyboard = Console.reduceConsoleInput(
      initial,
      { kind: "key", key: "down" },
      frame,
    );
    const press = Console.reduceConsoleInput(
      initial,
      {
        kind: "mouse",
        phase: "press",
        button: "left",
        x: 4,
        y: splitter.rect.y1,
        modifiers: { shift: false, alt: false, ctrl: false },
      },
      frame,
    );
    const drag = Console.reduceConsoleInput(
      press.state,
      {
        kind: "mouse",
        phase: "drag",
        button: "left",
        x: 4,
        y: splitter.rect.y1 + 1,
        modifiers: { shift: false, alt: false, ctrl: false },
      },
      frame,
    );

    expect(drag.state.splitterRatio).toBe(keyboard.state.splitterRatio);
    const resized = Console.renderConsoleFrame(projection, drag.state, {
      columns: 80,
      rows: 24,
    });
    expect(
      resized.hitRegions.find(({ id }) => id === "splitter")?.rect.y1,
    ).toBe(splitter.rect.y1 + 1);
    expect(drag.intents).toStrictEqual([]);
  });

  it("keeps bracketed paste inert in the focused editor", () => {
    const decoder = new Console.TerminalInputDecoder({ maxPasteBytes: 64 });
    const state = Console.createConsoleState({
      focus: "input",
      draft: "before:",
      pendingCommandId: "pending-1",
    });
    const frame = Console.renderConsoleFrame(projection, state, {
      columns: 80,
      rows: 24,
    });
    const events = decoder.push(
      Buffer.from("\u001b[200~q\nconfirm\u001b[31m\u0003\u001b[201~"),
    );
    let current = state;
    const intents: Console.ConsoleIntent[] = [];
    for (const event of events) {
      const result = Console.reduceConsoleInput(current, event, frame);
      current = result.state;
      intents.push(...result.intents);
    }

    expect(current.draft).toBe("before:q\nconfirm<ESC>[31m<C0-03>");
    expect(current.pendingCommandId).toBe("pending-1");
    expect(intents).toStrictEqual([]);
  });

  it("ignores selection gestures and cannot activate across a resize", () => {
    const state = Console.createConsoleState({ mouseCapture: true });
    const reference = Console.renderConsoleFrame(projection, state, {
      columns: 80,
      rows: 24,
    });
    const accept = reference.hitRegions.find(({ id }) => id === "action:accept");
    if (accept === undefined) {
      return;
    }
    const shifted = Console.reduceConsoleInput(
      state,
      {
        kind: "mouse",
        phase: "press",
        button: "left",
        x: accept.rect.x1,
        y: accept.rect.y1,
        modifiers: { shift: true, alt: false, ctrl: false },
      },
      reference,
    );
    expect(shifted.state).toStrictEqual(state);
    expect(shifted.intents).toStrictEqual([]);

    const pressed = Console.reduceConsoleInput(
      state,
      {
        kind: "mouse",
        phase: "press",
        button: "left",
        x: accept.rect.x1,
        y: accept.rect.y1,
        modifiers: { shift: false, alt: false, ctrl: false },
      },
      reference,
    );
    const wide = Console.renderConsoleFrame(projection, pressed.state, {
      columns: 120,
      rows: 40,
    });
    const wideAccept = wide.hitRegions.find(({ id }) => id === "action:accept");
    if (wideAccept === undefined) {
      return;
    }
    const released = Console.reduceConsoleInput(
      pressed.state,
      {
        kind: "mouse",
        phase: "release",
        button: "left",
        x: wideAccept.rect.x1,
        y: wideAccept.rect.y1,
        modifiers: { shift: false, alt: false, ctrl: false },
      },
      wide,
    );
    expect(released.intents).toStrictEqual([]);
  });
});

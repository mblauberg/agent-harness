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
    const events = [
      ...decoder.push(
        Buffer.from("\u001b[200~q\nconfirm\u001b[31m\u0003\u001b[201~"),
      ),
      ...decoder.flushPasteBoundary(),
    ];
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

  it("cannot activate a focused control that is absent from the current frame", () => {
    const stale = Console.createConsoleState({
      focus: "actions",
      focusedRegionId: "action:accept",
      pendingCommandId: "pending-must-survive",
    });
    const compact = Console.renderConsoleFrame(projection, stale, {
      columns: 40,
      rows: 8,
    });
    expect(compact.hitRegions.some(({ id }) => id === "action:accept")).toBe(
      false,
    );

    for (const event of [
      { kind: "key", key: "enter" },
      { kind: "key", key: "space" },
    ] as const) {
      const result = Console.reduceConsoleInput(stale, event, compact);
      expect(result.intents).toStrictEqual([]);
      expect(result.state.pendingCommandId).toBe("pending-must-survive");
    }

    const full = Console.renderConsoleFrame(projection, stale, {
      columns: 80,
      rows: 24,
    });
    const disabled: Console.ConsoleFrame = {
      ...full,
      hitRegions: full.hitRegions.map((region) => ({
        ...region,
        enabled: region.id !== "action:accept",
      })),
    };
    expect(
      Console.reduceConsoleInput(
        stale,
        { kind: "key", key: "enter" },
        disabled,
      ).intents,
    ).toStrictEqual([]);
  });

  it("reaches every view and action from default keyboard state", () => {
    let state = Console.createConsoleState();
    let frame = Console.renderConsoleFrame(projection, state, {
      columns: 80,
      rows: 24,
    });
    expect(state.activeView).toBe("Attention");

    const views = [
      "Attention",
      "Project",
      "Runs",
      "Work",
      "Agents",
      "Evidence",
      "Activity",
      "System",
    ] as const;
    const altKeys = [
      "alt-1",
      "alt-2",
      "alt-3",
      "alt-4",
      "alt-5",
      "alt-6",
      "alt-7",
      "alt-8",
    ] as const;
    for (const [index, view] of views.entries()) {
      const result = Console.reduceConsoleInput(
        state,
        { kind: "key", key: altKeys[index] ?? "alt-1" },
        frame,
      );
      state = result.state;
      frame = Console.renderConsoleFrame(projection, state, {
        columns: 80,
        rows: 24,
      });
      expect(state.activeView).toBe(view);
      expect(state.focusedRegionId).toBe(`tab:${view}`);
    }

    state = Console.createConsoleState();
    frame = Console.renderConsoleFrame(projection, state, {
      columns: 80,
      rows: 24,
    });
    state = Console.reduceConsoleInput(
      state,
      { kind: "key", key: "tab" },
      frame,
    ).state;
    expect(state.focusedRegionId).toBe("tab:Attention");
    state = Console.reduceConsoleInput(
      state,
      { kind: "key", key: "right" },
      frame,
    ).state;
    expect(state.focusedRegionId).toBe("tab:Project");
    state = Console.reduceConsoleInput(
      state,
      { kind: "key", key: "left" },
      frame,
    ).state;
    expect(state.focusedRegionId).toBe("tab:Attention");
    state = Console.reduceConsoleInput(
      state,
      { kind: "key", key: "shift-tab" },
      frame,
    ).state;
    expect(state.focusedRegionId).toBe("detach");

    const actions = [
      ["d", "action:discuss"],
      ["a", "action:accept"],
      ["c", "action:request-changes"],
      ["f", "action:defer"],
      ["i", "action:implement"],
    ] as const;
    for (const [shortcut, regionId] of actions) {
      state = Console.createConsoleState();
      frame = Console.renderConsoleFrame(projection, state, {
        columns: 80,
        rows: 24,
      });
      const focused = Console.reduceConsoleInput(
        state,
        { kind: "key", key: "text", text: shortcut },
        frame,
      );
      expect(focused.intents).toStrictEqual([]);
      expect(focused.state.focusedRegionId).toBe(regionId);
      const activated = Console.reduceConsoleInput(
        focused.state,
        { kind: "key", key: "space" },
        frame,
      );
      expect(activated.intents).toStrictEqual([
        {
          kind: "activate-region",
          regionId,
          provenance: "keyboard",
        },
      ]);
    }

    const escaped = Console.reduceConsoleInput(
      state,
      { kind: "key", key: "escape" },
      frame,
    );
    expect(escaped.state).toMatchObject({
      focus: "master",
      focusedRegionId: null,
      pressedRegionId: null,
    });
    expect(escaped.intents).toStrictEqual([]);
  });

  it("applies mouse capture through the terminal owner before rendering it", () => {
    const state = Console.createConsoleState({ mouseCapture: false });
    const frame = Console.renderConsoleFrame(projection, state, {
      columns: 80,
      rows: 24,
    });
    const requested = Console.reduceConsoleInput(
      state,
      { kind: "key", key: "alt-m" },
      frame,
    );

    expect(requested.state.mouseCapture).toBe(false);
    expect(requested.intents).toStrictEqual([
      {
        kind: "set-mouse-capture",
        enabled: true,
        provenance: "keyboard",
      },
    ]);
    const terminal = {
      mouseCapture: false,
      setMouseCapture(enabled: boolean): void {
        this.mouseCapture = enabled;
      },
    };
    const applied = Console.applyConsoleTerminalIntent(
      requested.state,
      requested.intents[0],
      terminal,
    );
    expect(applied.mouseCapture).toBe(true);
    expect(
      Console.renderConsoleFrame(projection, applied, {
        columns: 80,
        rows: 24,
      }).rows[3],
    ).toContain("MOUSE:ON");
  });

  it("finishes a splitter drag locally without activation", () => {
    const state = Console.createConsoleState({ mouseCapture: true });
    const frame = Console.renderConsoleFrame(projection, state, {
      columns: 80,
      rows: 24,
    });
    const splitter = frame.hitRegions.find(({ id }) => id === "splitter");
    if (splitter === undefined) {
      return;
    }
    const press = Console.reduceConsoleInput(
      state,
      {
        kind: "mouse",
        phase: "press",
        button: "left",
        x: 2,
        y: splitter.rect.y1,
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
        x: 2,
        y: splitter.rect.y1,
        modifiers: { shift: false, alt: false, ctrl: false },
      },
      frame,
    );
    expect(release.intents).toStrictEqual([]);
    expect(release.state.pressedRegionId).toBeNull();
  });

  it("keeps tab selection local for keyboard and mouse", () => {
    const initial = Console.createConsoleState({ mouseCapture: true });
    const frame = Console.renderConsoleFrame(projection, initial, {
      columns: 80,
      rows: 24,
    });
    const focused = Console.reduceConsoleInput(
      initial,
      { kind: "key", key: "alt-2" },
      frame,
    );
    const keyboard = Console.reduceConsoleInput(
      focused.state,
      { kind: "key", key: "enter" },
      frame,
    );
    expect(keyboard.state.activeView).toBe("Project");
    expect(keyboard.intents).toStrictEqual([]);

    const runs = frame.hitRegions.find(({ id }) => id === "tab:Runs");
    if (runs === undefined) {
      return;
    }
    const press = Console.reduceConsoleInput(
      initial,
      {
        kind: "mouse",
        phase: "press",
        button: "left",
        x: runs.rect.x1,
        y: runs.rect.y1,
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
        x: runs.rect.x1,
        y: runs.rect.y1,
        modifiers: { shift: false, alt: false, ctrl: false },
      },
      frame,
    );
    expect(release.state.activeView).toBe("Runs");
    expect(release.intents).toStrictEqual([]);
  });

  it("safe-detaches on fatal input and never activates focused Accept from paste", () => {
    const accept = Console.createConsoleState({
      focus: "actions",
      focusedRegionId: "action:accept",
      pendingCommandId: "pending-accept",
    });
    const frame = Console.renderConsoleFrame(projection, accept, {
      columns: 80,
      rows: 24,
    });
    const pasted = Console.reduceConsoleInput(
      accept,
      { kind: "paste", text: "\u001b[201~\rconfirm" },
      frame,
    );
    expect(pasted.state).toStrictEqual(accept);
    expect(pasted.intents).toStrictEqual([]);

    const fatal = Console.reduceConsoleInput(
      accept,
      { kind: "fatal", reason: "input-quarantine-lost" },
      frame,
    );
    expect(fatal.intents).toStrictEqual([
      { kind: "detach", provenance: "safety" },
    ]);
    expect(fatal.state.pendingCommandId).toBe("pending-accept");
  });
});

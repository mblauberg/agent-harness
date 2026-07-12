# Project Fabric Console terminal runtime

Status: Implemented terminal-runtime decision; fallback not triggered

Decision date: 11 July 2026

Implementation evidence cut-off: 12 July 2026

Evidence snapshot: [July 2026 continuity and routing evidence](evidence-snapshots/agent-continuity-routing-2026-07.md)

Normative owner: [Spec 05 sections 8, 15 and 17](../specs/05-project-fabric-console.md)

## Decision

Use Node 24/TypeScript with a project-owned dynamically sized semantic cell-grid
renderer and bounded terminal input parser. Keep Rust with Ratatui/Crossterm as
the objective fallback only if the mandatory terminal spike fails after one
bounded repair. Do not add Go or C++ for the current Console.

The TypeScript spike passed the required resize, input, hostile-text and
terminal-restoration oracles, so the Rust fallback was not triggered. The
remaining full Console/runtime/evaluation gates stay owned by Spec 05.

The 80x24 frame is the default/reference acceptance viewport, not a fixed
terminal size. Runtime layout follows current dimensions. Exact compact and
inert thresholds, state preservation and resize oracles are owned by Spec 05.

## Conclusions

- The repository already pins Node, TypeScript, npm and the public Fabric
  client. A second full UI language would duplicate protocol bindings,
  packaging, audits and parity tests before improving a product oracle.
- A pure semantic cell grid matches deterministic snapshots, dynamic reflow,
  shared keyboard/mouse intent and terminal-safety testing without importing a
  second UI state owner.
- Ink lacks the required first-class mouse contract for this design. OpenTUI
  adds a Zig/Bun-oriented native path. Both are useful evidence, not current
  dependencies.
- Rust/Ratatui has the strongest fixed-buffer fallback and precise terminal
  mode control, but still needs a generated/parity-tested protocol binding and
  exact Crossterm mouse-mode handling.
- Go/Bubble Tea is attractive for a greenfield terminal app but adds a new
  toolchain here and retains native-selection/captured-mouse trade-offs.
- C++/FTXUI adds native-memory, ABI and packaging risk without removing the
  protocol, input or safety work.
- Render state stays outside the renderer; current geometry recomputes regions
  and hit boxes. UI code never owns Fabric mutation or authority.

## Option evidence

| Option | Evidence | Disposition |
|---|---|---|
| TypeScript + Ink | Gemini CLI demonstrates a large TypeScript terminal client, but its pinned Ink path does not supply this mouse/selection contract. | Reject framework; retain TypeScript. |
| TypeScript + OpenTUI | OpenTUI powers OpenCode with a native Zig core and Bun-oriented path. | Reject for the current Node-only runtime. |
| TypeScript semantic cell grid | Directly supports current-dimension frames, exact 80x24 reference snapshots, a shared reducer and bounded SGR parser. | Selected. |
| Rust + Ratatui/Crossterm | `TestBackend` and Codex demonstrate strong fixed-buffer/runtime evidence. | Objective fallback. |
| Go + Bubble Tea | Strong event model and real products, but a new local/CI toolchain and selection/capture issue. | Best greenfield alternative; reject here. |
| C++ + FTXUI | Keyboard/mouse capable. | Reject for safety/ABI/packaging cost. |

Interaction references remain gh-dash for dense master/detail navigation,
Lazygit for contextual Git actions, K9s for operator projection with mouse off
by default, GitUI for render/service separation and Zellij for explicit mode
and selection consequences. They are design references, not dependencies or
compatibility claims.

## Binding spike evidence

The decision-time spike gate required TDD proof of:

1. the semantic grid renders exact normalised dimensions, including inert,
   30x6 minimum compact, reference/default 80x24 and wide frames;
2. grow/shrink/inert transitions preserve stable selected IDs, focus, scroll,
   drafts and pending commands while recomputing hit regions;
3. invalid, zero and ultra-small dimensions allocate bounded state, dispatch
   no Fabric mutation and retain `q`/Detach plus terminal restoration;
4. pinned grapheme/cell-width rules keep combining text, CJK, emoji, clipping
   and pointer hit boxes aligned;
5. one reducer maps keyboard and SGR press/release/wheel/drag into the same
   semantic intents;
6. capture emits only exact 1002 button tracking and 1006 SGR coordinates,
   can be disabled, and emits no mouse modes under native selection;
7. partial, malformed and oversized input stays bounded and inert;
8. bracketed paste enables only mode 2004, inserts bounded text and never turns
   pasted shortcut/control/newline bytes into submit or confirmation;
9. untrusted control/bidi text cannot place an escape sequence in output; and
10. normal exit, PTY loss, signal and forced error restore terminal state.

Failure after one bounded repair switches to Rust/Ratatui and adds pinned Rust
CI plus generated or exhaustive public-protocol parity. The switch does not
weaken Spec 05 or itself authorise a broader native rewrite.

## Runtime boundary

The terminal runtime owns rendering, input decoding and terminal setup only.
State arrives through the negotiated public operator client. Styles are
presenter-authored enums; untrusted data is sanitised before cell construction.
Keyboard and mouse reach the same intent, preview, confirmation and protocol
paths. No framework may bypass action authority, mutate SQLite, parse daemon
internals or turn resize into an action.

## Unknowns

- Whether measured performance, memory or isolation failures ever trigger the
  Rust fallback.
- Terminal/emulator-specific grapheme, selection and pointer edge cases beyond
  the pinned fixture matrix.
- Whether a future browser client is warranted by failed TUI human usability,
  not preference alone.

## Refresh triggers

Refresh after a Node/terminal parser change, material emulator/input failure,
failed 30x6/80x24/wide snapshot, accessibility/usability regression, repeated
render performance breach, or major Ink/OpenTUI/Ratatui/Bubble Tea/FTXUI
contract change. Re-check upstream source before claiming current maintenance,
toolchain or issue status.

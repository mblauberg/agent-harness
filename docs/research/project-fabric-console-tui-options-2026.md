# Project Fabric Console terminal-runtime decision

Date: 11 July 2026
Decision: Node 24 with a project-owned dynamically sized cell-grid renderer and
bounded terminal input parser
Fallback: Rust with Ratatui and exact Crossterm mode control, only if the
mandatory terminal spike fails

## Context

Spec 05 requires a standalone Console that is fully usable at its default and
reference 80 by 24 viewport, reflows across changing terminal sizes, supports
keyboard and SGR-mouse parity, preserves native text selection under
configurable capture,
selection, hostile-message neutralisation, deterministic snapshots and a typed
Unix-socket protocol. The specification deliberately binds behaviour and
package seams rather than an implementation language.

The repository already pins Node 24, TypeScript, npm locking and a typed public
Fabric protocol client. Its CI has no Go or Rust job. A second implementation
language would therefore add another protocol binding, parity tests, toolchain,
dependency audit and packaging matrix before it improved any product oracle.

## Options considered

| Option | Evidence | Decision |
| --- | --- | --- |
| TypeScript plus Ink | [Gemini CLI](https://github.com/google-gemini/gemini-cli/blob/main/packages/cli/package.json) demonstrates a large TypeScript terminal client, but pins an Ink fork; Ink has no first-class mouse contract for this design. | Reject Ink; retain TypeScript. |
| TypeScript plus OpenTUI | [OpenTUI](https://github.com/anomalyco/opentui) powers OpenCode, but introduces a Zig native core and Bun-oriented build path. | Reject for this Node-only runtime. |
| TypeScript cell-grid engine | A pure dynamically sized cell grid with an exact 80 by 24 reference snapshot, shared reducer and bounded 1002 plus 1006 parser directly matches the acceptance oracles and reuses the public protocol client. | **Selected.** |
| Rust plus Ratatui/Crossterm | [Ratatui's `TestBackend`](https://docs.rs/ratatui/latest/ratatui/backend/struct.TestBackend.html) is the strongest fixed-buffer test surface and [Codex CLI](https://github.com/openai/codex/blob/main/codex-rs/tui/Cargo.toml) proves the stack at scale. Crossterm's convenience mouse command enables broader modes than Spec 05 permits, so exact mode control remains application work. | Objective fallback. |
| Go plus Bubble Tea | [Bubble Tea v2](https://github.com/charmbracelet/bubbletea/blob/main/UPGRADE_GUIDE_V2.md) has the best high-level event model and powers [Crush](https://github.com/charmbracelet/crush), but Go is absent locally and from CI, v2 is recent, and captured mouse still conflicts with native selection in its [open issue](https://github.com/charmbracelet/bubbletea/issues/162). | Best greenfield framework; reject here. |
| C++ plus FTXUI | [FTXUI](https://github.com/ArthurSonzogni/FTXUI) supports keyboard and mouse, but adds native-memory, ABI, dependency and packaging risk without reducing the protocol or terminal-safety work. | Reject. |

Useful interaction references are [gh-dash](https://github.com/dlvhdr/gh-dash)
for dense master/detail navigation, [Lazygit](https://github.com/jesseduffield/lazygit)
for contextual Git actions, [K9s](https://github.com/derailed/k9s) for a live
operator projection with mouse off by default, [GitUI](https://github.com/gitui-org/gitui)
for render/service separation, and [Zellij](https://github.com/zellij-org/zellij)
for explicit mode and selection consequences. These are design references, not
code dependencies.

## Binding implementation gate

Before the full Console is written, a TDD spike must prove all of these in the
Node implementation:

- a semantic grid renders exactly the current terminal dimensions, including
  the reference 80 by 24 frame and representative larger frames;
- grow/shrink and smaller-than-reference `SIGWINCH` sequences preserve selected IDs,
  focus, scroll, drafts and pending commands while recomputing hit regions;
- undefined, zero and ultra-small dimensions render only a bounded clipped safe
  state, perform no Fabric mutation, and retain detach/teardown handling until a
  valid resize;
- grapheme segmentation and a pinned terminal-cell-width policy keep combining
  text, wide CJK characters, emoji, clipping and pointer hit boxes aligned in
  80 by 24 and resize snapshots;
- one reducer maps keyboard and SGR press, release, wheel and drag input to the
  same semantic intents;
- capture emits only button-event tracking 1002 and SGR coordinates 1006, can
  be disabled, and emits no mouse modes while native selection is enabled;
- partial, malformed and oversized input sequences remain bounded and inert;
- bracketed paste enables only exact mode 2004, routes bounded paste bytes to
  the focused editor as text, never interprets pasted shortcuts, newlines or
  control sequences as submit/confirm actions, and is disabled on every exit;
- untrusted control and bidi text cannot place an escape sequence in output;
- PTY exit, signal and forced-error paths restore terminal state.

Failure of any oracle after one bounded repair switches the implementation to
Rust/Ratatui. The switch must add a generated or exhaustively parity-tested
Rust public-protocol binding and pinned Rust CI; it does not, by itself, amend
Spec 05.

## Consequences

The selected design owns only rendering, input decoding and terminal setup. It
does not own Fabric state, command authority or wire vocabulary. Console data
continues to arrive through the negotiated public operator client. Styles are
presenter-authored enums; untrusted data is sanitised before cell construction.
No framework may bypass the shared action-intent, confirmation or protocol
paths.

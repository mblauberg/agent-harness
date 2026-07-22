# Adaptive Attention Deck — visual direction and first slice

Design direction for issue #141's Deck default view. Companion to
`operator-interaction.md` (attention principles), `scope-and-projections.md`
(projection facts) and `acceptance.md` (10-second test). This document owns
visual language and the first shippable slice only; it creates no new state,
view or projection.

## 1. Visual language

### Attention-first hierarchy

The Deck answers two questions on sight: *what needs me* and *what is running*.
Rank the surface accordingly, top to bottom:

1. **Identity/status strip** — project, session, Needs-you count, active-run
   count, connection/freshness, Detach path. Always present at every usable size
   (`operator-interaction.md`: these fields survive all collapses).
2. **Needs you** — the strict queue: explicit gates, expiring authority,
   critical blockers, acceptance-ready. Ordered by safety/integrity →
   critical-path blocked → expiring authority → acceptance-ready, duplicates
   grouped. Never populated by inactivity, volume, context pressure or pane
   absence.
3. **Active runs** — the roster: project sessions, coordination runs and
   delivery workstreams kept distinct, never flattened or auto-selected.
4. **Watch** — collapsed by default, a count and one summary line; expands on
   demand; can never outrank Needs you.

Attention is a budget: a quiet, healthy project should render as mostly empty
space, not a wall of rows. Detail earns its cells only when it changes a
decision.

### Typography-in-TUI

Weight comes from brightness and position, not from drawing boxes around
everything. One optional horizontal rule separates the strip from the body; the
Needs-you / Active-runs / Watch bands are separated by a blank line and a dim
single-line heading, not nested borders. Reserve full-bright text for the
Needs-you rows and the identity strip; render roster and Watch at normal weight;
render provenance/age suffixes dim. Column 1 is a fixed two-cell **urgency
glyph** gutter (see below) so the eye can scan severity down a single column
without reading text. Focus is a `>` caret in a leading gutter; selection is
`*`; both are shape, never colour alone.

### Colour semantics (with mandatory non-colour twin)

Colour is redundant emphasis layered on a glyph/label that already carries the
meaning (`operator-interaction.md`: non-colour urgency indicators; acceptance
test 3; WCAG 1.4.1). Four semantic roles, each pinned to an existing field:

| Role | Trigger (existing field) | Glyph | Colour | Non-colour twin |
|---|---|---|---|---|
| Needs-you | urgency `safety-integrity`/`critical-path`/`expiring-authority`/`acceptance-ready` | `!!` `!>` `!` `+` | red / amber | glyph + full-bright text + band position |
| Healthy | run `health` ok, freshness `live` | ` ` | green/default | plain normal-weight row |
| Degraded | `health` degraded, session `visibility_degraded` | `~` | amber | `~` glyph + `DEGRADED` word |
| Stale/absent | freshness `stale`/`unavailable`/`conflict` | `?` | dim/grey | freshness word (`STALE`, `UNAVAILABLE`) suffix |

The `URGENCY_MARKER` map and freshness labels already exist in
`row-presentation.ts`; this slice reuses them and adds no new severity source.
No fact is conveyed by colour with no textual/glyph twin. In `--no-colour` the
glyph gutter and freshness words carry the full signal unchanged.

### Density rules

- One line per row. No two-dimensional scroll on any primary list.
- Ultra-wide: cap readable text width; spend surplus columns on more roster
  fields (lead, phase, next milestone, last-event age), never stretched prose.
- Narrow-tall: drop trailing detail columns before dropping identity/freshness/
  action. Collapse Watch first, roster second; Needs-you is last to yield.

### Empty and degraded states

- No Needs-you: render `Needs you: nothing waiting` in normal weight — an
  explicit calm state, not a hidden band.
- No runs: `Active runs: none` rather than an empty frame.
- Degraded/stale data: keep the row, mark it with its `~`/`?` glyph and
  freshness word; never blank it and never infer a value to fill the gap.
- Disconnected: the strip shows the connection state; body shows last snapshot
  with every row stamped `STALE`/`UNAVAILABLE`.

### Mockups

80x24 stacked (reference viewport):

```
 proj:atlas  sess:s_04  NEEDS YOU 2  RUNS 3  live 4s   [?]Help [q]Detach
 ───────────────────────────────────────────────────────────────────────
 Needs you
 >!! gate: approve migration plan          run_01  LIVE 8s   [a]nswer
  !  authority expires in 6m               sess    LIVE 2m   [r]enew
 Active runs
  · coordination run_01  chair@atlas  phase:build   health:ok    12s
  ~ workstream ws_03    lead@ws3     phase:review  DEGRADED     40s
  · workstream ws_07    lead@ws7     phase:impl     health:ok     3s
 Watch (5)  ▸ latest: evidence published ws_03            [w] expand
 ───────────────────────────────────────────────────────────────────────
 [↑↓]move [enter]open run  [tab]focus band  [q]Detach
```

Wide simultaneous (≥120 cols): Needs-you and Active-runs sit side by side, Watch
as a right rail; same glyph gutter and fields, roster gains lead/next-milestone.

```
 Needs you            │ Active runs                          │ Watch (5)
 >!! approve plan  8s │  · run_01 chair@atlas build ok   12s │ · evidence ws_03
  !  authority     6m │  ~ ws_03 lead@ws3 review DEGRD   40s │ · msg  chair
                      │  · ws_07 lead@ws7 impl  ok        3s │ · lease renew
```

30x6 minimum compact:

```
atlas NEEDS 2 RUNS 3 !
>!! approve plan   8s
 !  authority      6m
run_01 build ok   12s
[enter]open [q]Detach
```

## 2. First vertical slice

**Goal:** the smallest Deck that is working and usable day-to-day — Needs-you
queue + collapsed Watch line + active-run roster, from existing projection
fields, stable under focus/scroll and stacked reflow. Nothing else.

### In scope

- Compose the **default attention view** as three stacked bands: Needs-you
  (existing `needsYouRows`), collapsed Watch (existing `watchRows` +
  `watchCollapsed`, count + one summary line), and a new **active-run roster**
  band built from the run summaries and `RunIdentity` already in the snapshot
  (`runKind`, `chairAgentId`, `lastEventAt`, plus `runId`, `phase`, `health`,
  `nextMilestone`).
- Keep coordination runs and delivery workstreams visually distinct using the
  existing `runIdentityCompactLabel`; never flatten or auto-select.
- Glyph gutter + freshness words as the non-colour signal; colour as redundant
  layer; `--no-colour` parity.
- Focus/scroll stability across `SIGWINCH` and 80x24 ↔ stacked reflow: preserve
  selected stable ID, focus owner, per-band scroll anchor, follow-tail; clamp on
  shrink without dispatch (per `operator-interaction.md` resize clause).
- Identity strip shows project, session, Needs-you count, run count, freshness,
  Detach at every size down to 30x6; inert mode below.

### Out of scope (deferred)

Filters, pins, session-local view state; run drill-down changes; theme system /
high-contrast beyond existing no-colour; new keymap beyond move/open-run/
expand-Watch/focus-band; any new protocol or projection field; declared-progress
`finite` arm and `n/N`; topology tree; processed-activity grouping; staged
connection diagnosis; mouse resize of splits.

### Files touched (console-only)

- `row-presentation.ts` — assemble the roster band from existing run summaries/
  `RunIdentity`; reuse `URGENCY_MARKER`, freshness labels, `runIdentityCompactLabel`.
- `presenter-model.ts` / `presenter.ts` — extend the Deck presentation with the
  roster band; no new state owner.
- `index.ts` — render three stacked bands + strip; glyph gutter; wide/compact/
  inert layout selection from row/column budgets.
- `run-presentation.ts` — reuse identity labels only.
- Tests/evaluations — Deck fixtures for empty, single-session, multi-run,
  degraded/stale; snapshots at 30x6, 80x24, 120x32, odd aspect; no-colour parity;
  resize focus/scroll preservation; unchanged protocol fixtures.

### Acceptance checks

1. 10-second test (acceptance #3): project/session/phase/owner/next-milestone/
   health/attention identifiable at 80x24; safety/critical outrank FYIs;
   duplicates grouped; freshness visible; no inferred percentage.
2. Coordination runs and workstreams render as distinct labelled rows.
3. Every non-colour twin present; `--no-colour` snapshot conveys identical
   severity and freshness.
4. Resize/SIGWINCH preserves selection, focus, per-band scroll, follow-tail; no
   submit/repeat/discard; 30x6 usable, below → inert with Detach live.
5. All eight canonical views still reachable and unchanged; no projection field
   asserted that the snapshot does not carry.

## 3. Fit with the phased plan

This slice is the **usable core of PHASE-PLAN.md Phase 1** ("Console shell and
current-data Deck"), taken at minimum width. It keeps Phase 1's console-only,
independently-mergeable, no-protocol-change property and its Deck-from-existing-
data thrust.

Deferred out of Phase 1 into later slices/phases: the renderer theme/layout/
keymap **extraction** (`theme.ts`/`layout.ts`/`keymap.ts`/`surfaces/`), session-
local **filters/pins**, and the full geometry sweep — done incrementally rather
than as one L refactor. Everything requiring a protocol/projection change
(run target, declared plans, workflow/topology, activity grouping, staged
connection) remains in Phase 2+ and is untouched here. The open design question —
who owns the immutable accepted/current plan declaration — does not gate this
slice, because the roster shows only already-landed identity facts and never a
finite denominator or percentage.

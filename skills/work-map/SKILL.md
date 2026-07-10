---
name: work-map
description: Use when work spans multiple sessions — a feature, migration, or investigation too big for one context window — and the project needs a persistent map of where the effort is, what's done, what's blocked, and what comes next. Also use when resuming multi-session work ("where were we"), or when several agents work the same effort in parallel. Complements the session skill's per-session handoffs with an effort-level map.
---

# work-map — the map for multi-session efforts

A handoff file (see `session`) carries ONE session's baton. When an effort
spans many sessions or agents, the batons pile up and nobody holds the route.
The work map is the effort-level view: one file per effort, updated as legs
complete, read first on every resume.

## The map file

`docs/efforts/EFFORT-<slug>.md` (or the project's equivalent dir). Structure:

```markdown
# EFFORT: <name>        Updated: YYYY-MM-DD  Status: active|blocked|done

## Destination
What done looks like, in one paragraph. Link the spec.

## Route (legs, ordered)
- [x] Leg 1 — <outcome> (done YYYY-MM-DD, commit/PR ref)
- [>] Leg 2 — <outcome> — IN PROGRESS, handoff: HANDOFF-....md
- [ ] Leg 3 — <outcome> (depends: leg 2)

## Blocked / parked
- <branch> — waiting on <gate/owner>, register row <ref>

## Invariants for every leg
Rules no session may break, with links — not restated content.

## Trail (one line per session, newest first)
- YYYY-MM-DD <operator/model>: <what moved>. <next>.
```

## Rules

- **Legs are outcomes, not tasks** — each leg independently verifiable and
  small enough for one session. A leg an agent can't finish in a session gets
  split at the next update.
- **Resume order** (interleaves with `session` start): project state file →
  this map → the claimed leg's handoff only → start. Never reconstruct the
  route from old transcripts or piled-up handoffs — consumed handoffs should
  already be archived.
- **Update on leg completion, not continuously** — the map is curated tier-2
  memory (see `~/.agents/HARNESS.md`); the trail line is one sentence, not a
  log. Session-level detail stays in handoffs.
- **Parallel agents claim a leg** by marking it `[>]` with their handoff file
  named — the path must exist and carry `Status: active` for that effort/leg;
  two agents on one leg is a coordination failure. Completing `[x]` consumes
  and archives that handoff in the same update, so finished legs never retain
  an apparently-current baton.
- **Effort done** → status `done`, then archive the map with the project's
  move-never-delete rule (`engineering-docs`).

## Red flags

- Three handoff files and no map → you needed work-map a session ago.
- Map restates the spec or invariants verbatim → link, don't copy; the map
  is a route, not a briefing pack.
- Trail growing past ~20 lines → prune consumed history to the archive;
  the route section already records outcomes.
- "I'll re-plan the whole effort" mid-route → re-planning is a leg: grill it,
  update Destination/Route once, dated.

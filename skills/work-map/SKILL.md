---
name: work-map
description: "Use when a multi-session effort needs one persistent route showing current leg, blockers, dependencies, and next work. Not for one-session checklists or handoffs; use session."
---

# work-map: the map for multi-session efforts

A `session` handoff carries one session's baton. Across many sessions or agents,
the work map holds the route: one file per effort, updated as legs complete and
read first on resume.

Record curated project/run/lead dependencies, outcome legs and user gates.
The map is not live task truth: link canonical Fabric or project artifacts and
never infer claims, completion, leases or current membership from the map.

## The map file

Use the project's canonical effort file. If no owner exists, propose
`docs/efforts/EFFORT-<slug>.md` only when project-write authority allows it;
otherwise return the map without writing. Structure:

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

## Trail (one line per route transition, newest first)
- YYYY-MM-DD: <leg/status/dependency change>. <next>.
```

## Rules

- **Legs are outcomes, not tasks**: each is independently verifiable and small
  enough for one session. Split an oversized leg at the next update.
- **Resume order** (interleaves with `session` start): project state file →
  this map → the claimed leg's handoff only → start. Never reconstruct the
  route from old transcripts or piled-up handoffs; consumed handoffs should
  already be archived.
- **Update on route transitions, not every session**: activate/block/complete a
  leg or change a dependency/gate. The map is curated durable project state;
  session-level detail stays in handoffs.
- **One chair/map owner writes the map.** Parallel workers write namespaced
  claim or handoff artifacts; the chair records `[>]` and `[x]` after checking
  the leg is unclaimed. Do not race on the shared file.
  Completing `[x]` consumes and archives that handoff in the same update, so
  finished legs never retain an apparently-current baton.
- **Effort done** → status `done`, then archive the map with the project's
  move-never-delete rule (`engineering-docs`).
- Validate an authored map with
  `scripts/validate_work_map.py <EFFORT-file>` before handoff. It enforces the
  single active leg and consumed-handoff invariants.

## Red flags

- Three handoff files and no map → you needed work-map a session ago.
- Map restates the spec or invariants verbatim → link, don't copy; the map
  is a route, not a briefing pack.
- Trail growing past ~20 lines → prune consumed history to the archive;
  the route section already records outcomes.
- "I'll re-plan the whole effort" mid-route → re-planning is a leg: grill it,
  update Destination/Route once, dated.

## Adapter-absent path

Console, Herdr and GitHub are optional. Continue from canonical project
artifacts and emit the skill-owned artifact kind in
[portable-workflow.v1.json](portable-workflow.v1.json). That filesystem
artifact remains a curated route, never live task truth.

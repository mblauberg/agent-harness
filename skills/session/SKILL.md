---
name: session
description: "Use for start, checkpoint, handoff, compaction, or end-of-session continuity on substantial work. Not for a multi-session route map or read-only write authority; use work-map for effort state."
---

# Session

Durable continuity belongs in the project's canonical owner when artifact
authority exists. Otherwise return a proposed handoff/state delta in chat. A
project variant overrides this protocol. Fallbacks, never competing owners:
state `docs/STATE.md` (about 120 lines), handoffs
`docs/handoffs/`, friction `docs/FRICTION.md`, archive `docs/archive/`.
Project instructions may override `STATE_FILE`, `HANDOFF_DIR`, `FRICTION_LOG`
and `ARCHIVE_DIR`.

## Start

For substantial work, start a fresh session at the approved phase/slice
boundary and reopen disk state; never trust injected state. Resume from the
digest-bound handoff and read only relevant docs and open decisions. Human
gates remain unanswered until a human decides them. Routine bounded work may
continue while its context is healthy and inside authority.

## Checkpoint

Before compaction or handoff, update the canonical handoff when authorised, or
return the same content without writing. Use
`HANDOFF-YYYY-MM-DD-<slug>.md` with:

- `Status: active`, effort/leg IDs, superseded path and `Consumed-at: pending`;
- original goal, disk-backed progress paths/commits, ordered remainder;
- invariants and exact verification commands.

Keep at most one active handoff per effort/leg. A fresh session resumes from
the file. In the same update, move a consumed handoff to the archive, mark it
consumed/time-stamped and index it; never delete it. Update the `work-map` for
multi-session efforts.

Before checkpoint, load
[context-hygiene.md](references/context-hygiene.md). Run its read-only audit
when run directories, logs, handoffs or large agent-facing docs accumulate.
Consolidate current state; never paste transcripts into handoffs.

Provider session retention is minimal: keep only contract-required identifiers,
generation/callback state and resumable digests. Never retain credentials or
raw transcripts as continuity state; after compaction revalidate generation,
expiry and ownership before reuse.

## End after changed state

1. **Graduate:** merge surviving behaviour-changing knowledge into its owner:
   decision -> spec/ADR; domain fact -> context/README; convention -> project
   `AGENTS.md`; moving status -> state. Reconcile contradictions, mark
   supersession, refresh timestamps and archive over-cap history. Do not append
   duplicates.
2. **Close context:** retain minimal manifest, synthesis, verification and
   failure receipts; archive consumed durable records. Remove only run-owned,
   manifest-classified ephemeral files after proving no live pointer needs
   them. Never delete unknown, pre-existing or user-owned untracked files.
   Revalidate time-sensitive memory against its owning source or mark it stale.
3. **Handoff version control:** run project checks and report the exact diff.
   Commit only with human/project authority; never commit another actor's state.
4. **Learn:** add skill/process friction to the friction log; either fix a
   small issue now or leave an owned open row.

Periodic hygiene is opt-in and records owner, cadence, scope, resource cap,
last success and disable condition. It may audit/archive classified artifacts
and refresh indexes; it may not commit, deploy, communicate externally or
delete unknown files. Staleness becomes visible state, not catch-up churn.

Project knowledge belongs in project docs. Harness-private memory contains only
cross-project user preferences; raw session logs never become state.

## Adapter-absent path

Console, Herdr and GitHub are optional. Continue from canonical project
artifacts and emit the skill-owned artifact kind in
[portable-workflow.v1.json](portable-workflow.v1.json). That filesystem
artifact is the resumable handoff evidence, not live task truth.

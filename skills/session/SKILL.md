---
name: session
description: Use when starting substantial work in any project, when a long session risks compaction or handoff to a fresh session, or when ending a session that changed project state. Covers session start reads, mid-session handoff files, session-end state updates, and graduating session findings into durable docs. Project-specific variants (e.g. project-session) override this skill in their own workspace.
---

# session — long-session protocol (any project)

Sessions routinely outlive one context window. Continuity lives on disk, not
in the conversation. Memory policy: `~/.agents/HARNESS.md` (two-tier,
repo-first). A project variant skill wins on conflict.

## Knobs (project defaults; override in the project's AGENTS.md or variant skill)

- `{{STATE_FILE}}` — rolling snapshot, default `docs/STATE.md`, hard cap ~120 lines
- `{{HANDOFF_DIR}}` — default `docs/handoffs/`
- `{{FRICTION_LOG}}` — skill/process friction rows, default `docs/FRICTION.md`
- `{{ARCHIVE_DIR}}` — consumed artefacts, default `docs/archive/`

## Session start (substantial work only)

1. Read `{{STATE_FILE}}` **from disk** — never trust a harness-injected
   snapshot of state/AGENTS content; injection races same-day edits.
2. Scan the project's open-decision register (if any) for gates touching the
   task. Never auto-answer a human gate.
3. Read task-relevant docs only. Do not tour archives or old deliverables.

## Mid-session checkpoint (before compaction / when handing off)

Write `{{HANDOFF_DIR}}/HANDOFF-YYYY-MM-DD-<slug>.md`:

1. **Lifecycle fields** — `Status: active`, `Effort: <id|none>`,
   `Leg: <id|none>`, `Supersedes: <path|none>`, `Consumed-at: pending`.
   There is at most one active handoff per effort/leg.
2. **Goal** — the original ask, verbatim where possible.
3. **State on disk** — what is done and WHERE (paths, commits).
4. **Remaining work** — ordered, concrete.
5. **Invariants** — rules the next session must not break.
6. **Verify** — exact commands proving the work is intact.

A fresh session resumes FROM THE FILE. Consumed handoff → move to
`{{ARCHIVE_DIR}}` in the same update, set `Status: consumed` and `Consumed-at`,
and index it (move, never delete). Multi-session efforts: also update the work
map (`work-map` skill).

Before the checkpoint, load [context-hygiene.md](references/context-hygiene.md)
and run its read-only audit when the project has accumulated run directories,
logs, handoffs or large agent-facing docs. Consolidate the current state before
compaction; never paste a raw transcript into the handoff.

## Session end (state changed → all steps)

1. **Graduate** (this is the pruning): for each finding this session, ask —
   did it survive, and does it change future behaviour? Yes → the doc that
   owns it; no → dies in the session log. Chooser: decision made →
   spec/ADR · fact about the domain/system → context digest or the relevant
   README · project convention agents must follow → project AGENTS.md ·
   still-moving status → `{{STATE_FILE}}`. Graduation is **consolidation,
   not append**: check the owning doc for an existing entry — update/merge
   it, create only if novel, delete or mark superseded what the new fact
   contradicts; date-stamp, newer wins. Refresh `{{STATE_FILE}}` timestamp;
   prune over-cap lines to archive.
2. **Context closure**: use the reference's three-tier classification. Retain
   the minimal manifest/synthesis/verification/failure receipts; archive
   consumed durable records; remove only ephemeral files created by this run
   after confirming no live pointer needs them. Never delete unknown,
   pre-existing or user-owned untracked files. Reconcile stale memory against
   its owning source and mark unverifiable time-sensitive claims stale.
3. **Version-control handoff**: run project checks and report the exact diff.
   Commit only when the human or project policy explicitly authorises it;
   otherwise leave a verified uncommitted handoff. Never commit someone else's
   working state.
4. **Learning loop**: friction, a gotcha, or a wrong/missing step in a skill →
   one-line row in `{{FRICTION_LOG}}`; fix now (small dated edit) or leave
   `open` for the next tuning pass. Fixing without logging hides the pattern.

Periodic/background hygiene is opt-in. Record owner, cadence, scope, resource
cap, last success and disable condition. It may audit, archive classified run
artifacts and refresh indexes; it may not commit, deploy, message externally or
delete unknown files. A missed/stale schedule becomes visible state, not an
infinite catch-up loop.

## Red flags

- "I'll keep the plan in my head" → write the handoff file.
- Durable knowledge in harness-private memory → invisible to other
  agents/operators; put it in a repo doc. Project-scoped conventions ("this
  repo uses pnpm") go in the project's AGENTS.md; private memory holds only
  cross-project user preferences and facts no repo owns.
- Session log pasted into the state file → graduate the conclusions, not
  the transcript.

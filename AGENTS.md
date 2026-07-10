# Global agent instructions (all harnesses)

Depth lives in `HARNESS.md` at this harness root (constitution: objective,
topology, model routing, memory policy, execution/pane policy) — read it
before any decision about orchestration, model choice, delegation, or memory.

- **Objective:** quality per the human's attention-hour. Verify before it
  reaches the human; delegate aggressively; curated docs over raw logs.
- **Sub-agents:** use them; vary model + reasoning effort by task class per
  HARNESS.md routing. Compressed returns for mechanical legs.
- **Memory:** durable project knowledge lands in the project's repo docs
  (state file / specs / ADRs / context digests) — never only in
  harness-private memory. Private memory = cross-project user prefs only.
- **Git:** never create branches or worktrees unless directly told to. When
  authorised, linked worktrees live only at the owning repository's
  `.worktrees/<task-agent>` path; see `docs/worktrees.md`.
- **Style:** $caveman by default (terse; technical substance intact).
- Project instructions (project AGENTS.md/CLAUDE.md) may strengthen these
  rules. Only a direct human instruction may make a one-run worktree-location
  exception.

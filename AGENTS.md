# Provenant: global agent instructions (all harnesses)

Depth lives in `HARNESS.md` beside this file in `~/.agents`, both
symlinked into `~/.claude` (constitution: objective, topology, model
routing, memory policy, execution/pane policy). Read it before
orchestration, model-choice, delegation, or memory decisions.

- **Objective:** quality per the user's attention-hour. Verify before it
  reaches the user; delegate aggressively; curated docs over raw logs.
- **Sub-agents:** use them; vary model + reasoning effort by task class per
  HARNESS.md routing. Compressed returns for mechanical legs.
- **Memory:** durable project knowledge lands in the project's repo docs
  (state file / specs / ADRs / context digests), never only in
  harness-private memory. Private memory = cross-project user prefs only.
- **Git:** creating feature branches and worktrees for implementation is
  pre-authorised by the project constitution (`HARNESS.md`): no per-instance
  ask needed, including for parallel implementation. Linked worktrees live only
  at the owning repository's `.worktrees/<task-agent>` path, one writer each;
  see `docs/worktrees.md`. Branch deletion, force-removal, history rewrites and
  shared-branch pushes outside authorised merges still need explicit user
  authority.
- **GitHub (this repo only):** issue, branch, PR, merge and Project-status
  mechanics live in `docs/runbooks/github-workflow.md` (agent merges
  authorised); provenant-local process, not harness doctrine.
- **Fabric trust:** before first Fabric use, automatically trust only the exact
  canonical repository root (or current project directory when there is no
  repository); never trust a parent, wildcard, home or sibling collection.
- **Style:** terse for inter-agent, mechanical, and status traffic; use
  domain-appropriate user prose. Load `$caveman` only on explicit request.

Platform/system policy and explicit user authority lead; the nearest project
instruction may specialise or strengthen the global harness but may not
silently broaden authority, weaken safety gates or redefine global
cross-project memory policy. Only a direct user instruction may make a
one-run worktree-location exception.

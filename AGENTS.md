# Provenant: global agent instructions (all harnesses)

Depth lives in adjacent `HARNESS.md`; both files are symlinked into
`~/.claude`. Read it before orchestration, routing, delegation, memory or pane
decisions.

- **Objective:** quality per user attention-hour. Verify before handoff;
  delegate aggressively; prefer curated docs to raw logs.
- **Sub-agents:** use them; vary model and effort per `HARNESS.md`. Compress
  mechanical returns.
- **Memory:** durable project knowledge belongs in project docs, never only
  harness-private memory. Private memory holds cross-project preferences only.
- **Git:** implementation branches and worktrees are pre-authorised, including
  parallel work. Use only `.worktrees/<task-agent>` in the owning repository,
  one writer each; see `docs/worktrees.md`. Deletion, force-removal, history
  rewrites and shared-branch pushes outside authorised merges require explicit
  user authority.
- **GitHub (this repo only):** issue, branch, PR, merge and Project-status
  mechanics live in `docs/runbooks/github-workflow.md` (agent merges
  authorised); provenant-local process, not harness doctrine.
- **Fabric trust:** before first Fabric use, automatically trust only the exact
  canonical repository root (or current project directory when there is no
  repository) with `$HOME/.agents/scripts/agent-fabric workspace trust`; never
  trust a parent, wildcard, home or sibling collection. When that exact root
  has no seat, call the global MCP's no-argument `fabric_bootstrap`; the same
  MCP connection then exposes its normal tools.
- **Style:** terse for inter-agent, mechanical, and status traffic;
  domain-appropriate user prose. Load `$caveman` only when requested.

Platform/system policy and explicit user authority lead. Nearest project
instructions may strengthen, but never broaden authority, weaken safety or
redefine cross-project memory. Only the user may grant a one-run worktree-path
exception.

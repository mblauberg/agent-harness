# EFFORT: project fabric console

Updated: 13 July 2026
Status: active

## Destination

Deliver the approved [Spec 05](../specs/05-project-fabric-console.md) from its
`c2fc623` approval baseline: a project-scoped terminal Console over the shared
Fabric, including the owned Spec 01/04 extensions, adaptive one-chair sessions,
typed operator actions, reliable result delivery, lifecycle skills and full
verification. Stop at explicit human acceptance; push and release remain
separate gates.

## Route

- [>] Leg 1: canonical delivery run, draft Spec 01/04 amendments and versioned
  evaluation plan; a frozen independent audit found nine unresolved P1s, so the
  amendments are not implementation-ready
- [>] Leg 2: one current public protocol and one current database baseline are
  consolidated on local `main` as preserved WIP; compact schema generation and
  invariant reconciliation remain open
- [>] Leg 3: project-session/operator persistence, daemon lifecycle,
  current-generation seats, task-bound answer-bearing provider reviews and MCP
  projection; lifecycle custody and the native review-portal supervisor are
  consolidated WIP, while review-evidence daemon composition remains open
- [>] Leg 4: standalone TypeScript Console and Herdr adapter, including
  responsive cell-grid rendering, terminal restoration and resize plumbing;
  the current 12x3 interactive strip contradicts the exact 30x6 minimum and
  requires TDD repair
- [ ] Leg 5: serial Fabric/RPC/MCP/package integration and affected lifecycle skills
- [ ] Leg 6: clean full harness/runtime/Console/Herdr/evaluation/load/audit gates and live MCP round-trip on the final integrated commit
- [ ] Leg 7: fresh native, Claude Opus, Cursor Grok and Gemini reviews, bounded repair and machine-ready receipt
- [ ] Leg 8: human-recorded 80x24 timed-identification evaluation and explicit final human acceptance

## Human gates and exclusions

- The automated Console evaluation intentionally cannot certify the human
  identification criterion. Final acceptance requires the human-recorded
  repetitions in the current [implementation handoff](../handoffs/HANDOFF-2026-07-13-project-fabric-console.md).
- Browser Console, remote listener, login daemon, arbitrary shell, automatic release/deploy and unauthorised Git publication remain excluded.

## Invariants for every leg

- Follow [HARNESS.md](../../HARNESS.md), amended [Spec 01](../specs/01-agent-fabric.md), amended [Spec 04](../specs/04-agent-fabric-operational-hardening.md) and binding [Spec 05](../specs/05-project-fabric-console.md).
- One Codex chair and one stage owner. Concurrent source writers have disjoint scopes in `.worktrees/<task-agent>`; shared integration is serial.
- New or changed behaviour requires a witnessed right-reason RED before production code.
- Fabric SQLite is the only coordination authority. Console, Herdr, GitHub, exports and this map are projections or evidence.
- Provider login, credential disclosure, push, deployment, release and irreversible actions remain prohibited.

## Trail

- 11 July 2026 Codex: created AFAB-004, amended the protocol/daemon owners before code, resolved all amendment review findings, froze the usability evaluation and isolated work from a concurrent skill-portfolio writer. Protocol TDD began; harness 421/421 and runtime 363/363 are green after a clean-worktree portability repair.
- 11 July 2026 Codex: compared current TypeScript, Rust, Go and C++ TUI stacks and open-source operator interfaces. Selected a small Node cell-grid terminal layer because it preserves one typed protocol/toolchain, with a mandatory responsive-render/PTY spike and automatic Rust/Ratatui fallback. Spec 05 v1.1 records 80x24 as the default/reference acceptance viewport and requires dynamic reflow with terminal resizing.
- 11 July 2026 Codex: compared 18 current open-source agent harnesses. Retained Fabric's one-chair, one-transaction-owner architecture; adopted gap-free durable projection catch-up and immutable Git-object binding as non-normative implementation hardening, while parking browser, external-ledger and merge-automation scope.
- 12 July 2026 Codex: completed the Console multi-session correction. The project client remains attached, exactly one attachable session auto-selects, multiple sessions require a stable run/session choice, `s` returns to the project selector, `--session` supports explicit/headless selection, and responsive/evidence state remains preserved across resize. Current Console clients require exact run/session projection instead of adding another legacy shim.
- 12 July 2026 Codex: consolidated Fabric onto one manifest-pinned database
  baseline and current protocol, removed pre-release import/fallback paths,
  bound MCP seats to current project/session/run principals and added
  task-bound answer-bearing provider review actions. The remaining route is
  fresh integrated evidence, independent review, the human timed-identification
  evaluation and final acceptance.
- 13 July 2026 Codex: corrected this map after live branch inspection. Protocol
  contracts and current result identities are staged on the serial integration
  branch; database invariant repair, responsive Console repair and the native
  review-portal supervisor are isolated parallel writes. Review-evidence,
  topology/context and lifecycle persistence still require serial integration
  before any full-gate or completion claim.
- 13 July 2026 Codex: admin-merged Provenant PR #6 under explicit authority,
  preserved all reviewed and WIP topic histories on local `main`, retained the
  user's comprehensive-review research, and prepared authorised worktree/branch
  cleanup. A fresh frozen lifecycle-receipt audit found nine P1 contract gaps;
  Specs 01 v0.36 and 04 v1.31 were relabelled draft-under-repair. No unfinished
  Spec 05 implementation was pushed or released.

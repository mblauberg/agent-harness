# EFFORT: project fabric console

Updated: 11 July 2026
Status: active

## Destination

Deliver the approved [Spec 05](../specs/05-project-fabric-console.md) from
`c2fc623`: a project-scoped terminal Console over the shared Fabric, including
the owned Spec 01/04 extensions, adaptive one-chair sessions, typed operator
actions, reliable result delivery, lifecycle skills and full verification.
Stop at explicit human acceptance; push and release remain separate gates.

## Route

- [x] Leg 1 — canonical AFAB-004 run, Spec 01 v0.4 and Spec 04 v1.1 amendments, independent amendment review and frozen evaluation plan (`c80e07f`)
- [>] Leg 2 — standalone public protocol package — IN PROGRESS; handoff: `.agent-run/AFAB-004/CHECKPOINT.md`
- [ ] Leg 3 — project-session/operator persistence and daemon lifecycle (depends: leg 2)
- [ ] Leg 4 — standalone Node Console and Herdr control adapter (depends: leg 2); first gate is the responsive cell-grid/SGR/PTY spike in the [terminal-runtime decision](../research/project-fabric-console-tui-options-2026.md), with Rust/Ratatui as the objective fallback
- [ ] Leg 5 — serial Fabric/RPC/MCP/package integration and affected lifecycle skills (depends: legs 3–4)
- [ ] Leg 6 — deterministic, security, evaluation and load gates (depends: leg 5)
- [ ] Leg 7 — native, Claude, Cursor Grok and Gemini review, bounded repair and machine-ready receipt (depends: leg 6)
- [ ] Leg 8 — final human acceptance

## Blocked / parked

- The primary checkout has unrelated uncommitted skill-portfolio work. AFAB-004 preserves it untouched and uses authorised repository-owned worktrees. The overlapping skills leg waits for that writer to close or provide a non-overlapping integration base.
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

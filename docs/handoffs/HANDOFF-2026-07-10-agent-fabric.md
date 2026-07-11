# Agent fabric implementation handoff

Status: final integration review / awaiting final human acceptance
Effort: agent-fabric
Leg: 7
Supersedes: none
Consumed-at: pending

## Goal

> implement all stages of the agent fabric spec entirely and properly

## State on disk

- The accepted target is [docs/specs/01-agent-fabric.md](../specs/01-agent-fabric.md).
- The effort route is [docs/efforts/EFFORT-agent-fabric.md](../efforts/EFFORT-agent-fabric.md).
- The canonical delivery receipt is `.agent-run/AFAB-001/RUN.json`
  (`contract: delivery-run`, schema v1).
- A coordination-only daemon is active in Herdr pane `w5:pF` and the MCP proxy is globally
  registered for Agy, Claude Code, Codex, Cursor and Kiro with separate
  project-scoped capability files.
- Real provider adapters remain disabled; registration has not consumed or
  changed provider logins.

## Remaining work

1. Human final acceptance.
2. Keep provider activation, release and push behind separate explicit gates.

## Implemented state

- Canonical SQLite/WAL daemon, exclusive lock, timed socket transport, startup recovery and foreground CLI.
- Symmetric Claude/Codex MCP input/output surface with principal-bound capabilities and scoped resources.
- Persistent supervised primary/optional adapter wrappers; all real entries remain disabled.
- Durable mailboxes, message bounds, tasks, leases, evidence barriers, lifecycle checkpoints, receipts, teams, budgets and subtree recovery.
- Architecture split across client/contracts, command journal, read policy, SQLite, receipts, transport and provider boundaries.
- Secure five-seat provisioning and renewal with immutable generation
  directories, one atomic current pointer, private credential files and
  secret-free registry configuration.
- Project-aware global proxy registration: each proxy resolves the nearest
  provisioned ancestor seat and fails closed outside provisioned projects.
- Child-owned OS-backed daemon lifetime locks keyed to both socket and database, explicit
  project-root authority binding, private SQLite/WAL/SHM modes, race-free
  credential reads and stdin-EOF proxy shutdown.
- Global registry entries for Agy, Claude Code, Codex, Cursor and Kiro.
- Fabric-default model routing fails closed for disabled or unresolved primary
  and bonus adapters; direct CLI callers opt in explicitly without bypassing
  family or model-pattern constraints.
- Five-seat MCP health smoke and acknowledged Codex↔Claude mailbox round trip.
- Current runtime gate: 82 test files / 279 tests, build/typecheck, evaluation,
  load and production dependency audit green.
- Current whole-harness gate: 312 tests plus 18/18 held-out orchestration
  attempts green.
- Calendar-dependent capability fixtures now use a durable test horizon; the
  expiry-fencing regression advances an injected clock to the configured
  boundary instead of depending on the wall calendar.
- Final native and Fable reviews are clean at P0–P2; the scoped fabric
  integration is committed on `main` and has not been pushed.

## Invariants

- Do not create branches or worktrees.
- Do not enable provider adapters, consume provider quota, install daemon
  auto-start, delete provider sessions, deploy, release or publish.
- Keep the visible Herdr daemon pane running while clients use the registered
  MCP. Automatic fabric-event rendering into Herdr chat is not implemented.
- Fable pane `w5:p7` is the observable other-primary partner; the run directory,
  not its scrollback, is authoritative.

## Verify

```sh
git status --short
npm --prefix runtime/agent-fabric run typecheck
npm --prefix runtime/agent-fabric test -- --run
python3 skills/deliver/scripts/validate_delivery.py \
  .agent-run/AFAB-001/RUN.json --workspace-root "$PWD" --verify-hashes
```

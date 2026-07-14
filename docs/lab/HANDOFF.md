# HANDOFF — LIVE programme checkpoint

Status: active

Effort: agent-harness-comprehensive-review

Leg: W018/upstream checkpoint complete; resume at W005

Supersedes: generated capstone stub in this path

Consumed-at: pending

Updated: 2026-07-14

This lab remains `STATUS: RUN`. The canonical fresh-session handoff is
[`docs/handoffs/HANDOFF-2026-07-14-agent-harness-comprehensive-review.md`](../../handoffs/HANDOFF-2026-07-14-agent-harness-comprehensive-review.md).

## Current truth

- W018 is independently CLEAN and integrated as `0bb25d5` + `054ae1a`.
- `origin/main@1ddfe24` is reconciled; pre-sanitation merge is `7f73c06`.
- Targeted merge verification: 210 tests. D-034 adds one mutation-sensitive
  release test after a right-reason RED; its author tree passes 100 focused and
  194 combined tests. The final remote checkpoint is valid only after 964 plus
  425 full harness, public-tree/range, static-security, spec-family, JavaScript
  and diff gates pass with a separate contained Opus CLEAN review.
- D-033 authorises one public-safe early checkpoint commit and non-force first
  push of `comprehensive-review` only. It does not accept W014 or close GOAL.
- The remote `comprehensive-review` ref is the checkpoint source of truth. On
  resume, fetch it and verify its sole base is current `origin/main`; if absent
  or divergent, finish/reconcile the checkpoint before new work.
- No PR is opened or merged. `main` is not pushed. Release/deploy/credential and
  other external-effect boundaries remain unchanged.

## Start here

1. Read `HARNESS.md`, `CHAIR-CHARTER.md`, `GOAL.md`, `STATE.md`,
   `DECISION_QUEUE.md`, `.orchestrator/runs.md`, then the canonical handoff.
2. Acquire/renew `LEASE.json`; verify remote refs, live panes/agents, worktrees,
   and the preserved dirty root.
3. Resume W005 at exact D-031 stage `7d779d02...` with a fresh contained Opus
   review. Then execute classifier GREEN, one-cause preflight/coordinator, and
   the later lifecycle direct cut in the order recorded in the canonical
   handoff and D-029/D-031.

## Retention and pruning

The tracked review directory remains load-bearing through W012/W013; no tracked
file is proven disposable yet. At this checkpoint remove only completed,
chair-owned W018 containment snapshots after their artifacts are reconciled.
Retain the W005 snapshot, all live worktrees, the authority/state/evidence spine,
and the user's queued re-review directory. Terminal pruning requires migration
of durable decisions/evidence, a compact archive record, and proof that no live
link or open W-item still targets this directory.

---
name: autonomous-lab
description: "Use when LARGE, open-ended, multi-agent work must run autonomously across sessions, crashes or compactions to a traceable human-gated finish and never self-halt until a human writes STOP — research synthesis, migration, literature review, architecture, security audit, market analysis, or another sprawling deliverable. Trigger on 'spin up an agent lab', 'run a long multi-agent job', 'explore the whole space', or 'keep going until I stop you'. Not for ordinary changes or one-shot fan-out."
---

# Autonomous lab

Use this tier for persistent work until the human sets `STATUS: STOP` in
`GOAL.md`. It consumes `orchestrate` per wave; software stays in `implement`.

Claude Code and Codex are equal operators. Claude may use workflows/Stop hook;
eligible Codex sessions may use Ultra/native multi-agent per iteration but
still require the external driver. Codex operators first read
[codex-operator.md](references/codex-operator.md).

## Entry gate

Use only when the mission exceeds a bounded change, has verifiable partitions,
needs persistent state plus an explicit STOP gate, and has known build,
disclosure, external-action and decision ceilings. Otherwise use
`orchestrate`, `implement` or `diagnose`.

## Bootstrap

1. Run `scripts/bootstrap-lab.sh <LAB_DIR>`, fill every CONFIG KNOB in
   `GOAL.md`, then rerun it to materialise/validate.
2. Preflight operator/review routes with
   `scripts/cross-family.sh --operator-family <family>`. Omission or unresolved
   model lineage fails closed. Missing other-primary coverage reaches a human
   gate; bonus-family failure is recorded and non-blocking.
3. Operate one iteration at a time after reading `OPERATING_MANUAL.md`,
   `GOAL.md`, `STATE.md` and queue head. Keep one orchestrator lease.
4. Interactive labs use Herdr and record owned panes. External-driver-only
   labs record `HERDR-NOT-USED: external driver; filesystem state is
   authoritative` in STATE.

Lab bootstrap authorises only GOAL-declared lab isolation, never source-repo
branches/worktrees. Separate human authority is required; then use
`${AGENTS_HOME:-$HOME/.agents}/scripts/worktree` and `.worktrees/<name>`.

## Operating loop

Run `RECONCILE -> READ -> SELECT -> DISPATCH -> RECORD -> PROPAGATE ->
REORG-if-due -> STATE -> WAKE/STOP`. Journal run and work unit before launch.
Delegate deep work; fan out independent contexts and serialise shared state.
Fork only one-way doors with convergence, deadline and kill switch. Bound
retries; escalate stalls with evidence. An empty queue triggers re-enumeration;
only human STOP ends the run. See
[operating-loop.md](references/operating-loop.md) and
[recovery-and-cadence.md](references/recovery-and-cadence.md).

## Evidence and closure

`STATE.md` holds current recovery truth and a five-note hot window; rotate
older closed material into indexed history. Decisions use immutable,
superseding ADRs. Keep claim -> owner -> evidence within three hops. Hard gates
require adversarial falsification, objective RED-on-mutation evidence and the
other primary; bonus evidence requires primary corroboration.

Cleanup must classify first: archive durable history; prune only run-owned,
manifest-classified ephemeral payload with no live reference. Never delete
unknown files. STOP requires GOAL/STATE/HANDOFF agreement, reconciled in-flight
work, closed or handed-off resources, and explicit residual human gates.

## References and tools

Load one relevant reference: `filesystem-memory.md`, `workflow-patterns.md`,
`model-effort-policy.md`, `cross-family-review.md`, `decision-lifecycle.md`,
`anti-placebo-and-convergence.md`, or the loop/recovery files above. Bootstrap
scaffolds, cross-family captures reviews, and tools regenerate status/indexes.

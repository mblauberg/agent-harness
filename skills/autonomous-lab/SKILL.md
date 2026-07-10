---
name: autonomous-lab
description: "Use when LARGE, open-ended, multi-agent work must run autonomously across sessions, crashes or compactions to a traceable human-gated finish and never self-halt until a human writes STOP — research synthesis, migration, literature review, architecture, security audit, market analysis, or another sprawling deliverable. Trigger on 'spin up an agent lab', 'run a long multi-agent job', 'explore the whole space', or 'keep going until I stop you'. Not for ordinary changes or one-shot fan-out."
---

# Autonomous lab

## Overview

Use this stateful tier when work spans many agents and sessions, must survive
crashes/compaction, and continues until the human changes `GOAL.md` to `STOP`.
The lab combines a filesystem memory, a bounded orchestration loop and
human-gated decision/release controls. It consumes `orchestrate` for each wave;
ordinary software delivery stays in `change`.

Claude Code and Codex are equal operators. Claude may use dynamic workflows and
its Stop hook. An eligible GPT-5.6 Codex lead uses Ultra/native multi-agent to
run one iteration's portable workflow graph; lower efforts use explicit waves.
Codex still needs the external loop driver for persistent run-until-STOP
re-invocation. The memory, evidence and gate contracts are identical; read
[codex-operator.md](references/codex-operator.md) before operating from Codex.

## Entry gate

Use only when all are true:

- the mission is open-ended or too large for one bounded change;
- useful work partitions into independently verifiable units;
- the human wants persistent run state and an explicit STOP gate;
- build, disclosure, external-action and human-decision ceilings are known.

Use `orchestrate` for a bounded fan-out or deep report, `change` for an approved
software change, and `diagnose` for tightly coupled debugging.

## Bootstrap

1. Run `scripts/bootstrap-lab.sh <LAB_DIR>`.
2. Fill the CONFIG KNOBS in `GOAL.md`: mission, locked constraints, hard and
   escalation gates, build ceiling, work layers, runaway caps and model matrix.
   The template comments define each field; do not duplicate them here.
3. Re-run the bootstrapper to substitute knobs, create the state/queue/ledger,
   install spine tools and report unresolved placeholders.
4. Preflight the operator and review routes. Pass
   `scripts/cross-family.sh --operator-family <family>`; omission fails closed.
   Resolve brokered model lineage before it can certify independence. Missing
   primary coverage stops at the human gate; bonus-family failure is recorded
   and non-blocking.
5. Start one iteration at a time. Claude installs the documented Stop hook;
   Codex uses the external driver. Both read `OPERATING_MANUAL.md` -> `GOAL.md`
   -> `STATE.md` -> queue head before work.
6. Interactive/steerable labs use Herdr under
   `orchestrate/references/herdr-panes.md` and record owned panes. An
   external-driver-only lab records `HERDR-NOT-USED: external driver;
   filesystem state is authoritative` in STATE. Keep one orchestrator lease.

The bootstrap creates a git-backed lab containing the current state, decision
queue/log, flat ADRs plus review sidecars, forks, bounded scaffolds, context,
tools and `.orchestrator/` run history. Workflows are authored per run from
[workflow-patterns.md](references/workflow-patterns.md); an empty `workflows/`
directory is expected.
An explicit request to bootstrap a lab authorises only lab-local isolation
declared in GOAL; it never authorises a branch/worktree in the source repo.
When the human separately authorises a linked worktree, create it only through
`${AGENTS_HOME:-$HOME/.agents}/scripts/worktree` at the owning repository's
primary-root `.worktrees/<name>`; `scaffolds/` remains for non-Git artifacts and
records.

## Operating loop

Run until the human writes `STATUS: STOP`:

```text
RECONCILE -> READ -> SELECT -> DISPATCH -> RECORD -> PROPAGATE
          -> REORG-if-due -> STATE -> WAKE/STOP
```

- Reconcile the in-flight ledger before selecting work.
- Journal run -> work-unit before launch, so compaction cannot orphan it.
- Delegate deep work; the orchestrator authors bookkeeping and persists worker
  evidence rather than recreating reasoning from memory.
- Fan out independent context boundaries. Serialise shared state.
- Fork only costly/one-way doors, with paths, convergence criteria, kill switch
  and deadline.
- Bound repair/retry loops; escalate stalled work with evidence.
- An empty queue means re-enumerate or deepen. Only the human STOP gate ends the
  standing run.

Full mechanics: [operating-loop.md](references/operating-loop.md) and
[recovery-and-cadence.md](references/recovery-and-cadence.md).

## Evidence, memory and closure

- `STATE.md` is the compact recovery anchor, not the audit log. Keep current
  truth plus the five-note hot window; rotate older closed notes/runs verbatim
  into indexed `.orchestrator/history/` segments.
- Durable decisions are immutable ADRs; changes supersede them. Current claim
  -> owner -> evidence stays within three hops.
- Hard gates require adversarial review, objective falsification/RED-on-mutation
  evidence and the other primary family. Bonus families are advisory until a
  primary corroborates their evidence.
- Reorg classifies artifacts before cleanup. Archive durable history. Prune only
  run-owned, manifest-classified ephemeral payload with no live reference;
  unknown/unmanifested files are never deleted.
- STOP requires GOAL, STATE and HANDOFF to agree, no un-reconciled in-flight
  work, owned panes/resources closed or handed off, and all residual gates
  explicit for the human.

## Reference map

| Need | Read |
|---|---|
| loop, caps, delegation and anti-patterns | [operating-loop.md](references/operating-loop.md) |
| filesystem schemas, compaction and retention | [filesystem-memory.md](references/filesystem-memory.md) |
| workflow archetypes authored per run | [workflow-patterns.md](references/workflow-patterns.md) |
| provider-independent model/effort policy | [model-effort-policy.md](references/model-effort-policy.md) |
| independent review and family separation | [cross-family-review.md](references/cross-family-review.md) |
| framing, decisions, forks and escalation | [decision-lifecycle.md](references/decision-lifecycle.md) |
| falsification and convergence gates | [anti-placebo-and-convergence.md](references/anti-placebo-and-convergence.md) |
| outages, compaction, wake and STOP | [recovery-and-cadence.md](references/recovery-and-cadence.md) |
| Codex wave/driver mapping | [codex-operator.md](references/codex-operator.md) |

## Bundled executables

- `scripts/bootstrap-lab.sh` scaffolds and validates a lab instance.
- `scripts/cross-family.sh` captures family-relative independent reviews.
- Copied spine tools generate/check the dashboard, ADR immutability manifest and
  ADR-to-code index. Generated files are regenerated, never hand-edited.

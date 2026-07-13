---
name: orchestrate
description: "Use when bounded fan-out, multi-agent research, cross-family review, parallel audits, or Herdr control improves coverage. Not for tiny work, tightly coupled debugging, or run-until-STOP jobs; use diagnose or autonomous-lab."
---

# Multi-agent orchestration

## Overview

One chair adapts topology: decompose -> waves -> reduce -> gate.

## Rules

- **Use parallel fan-out only after the decomposition/value gate passes.**
  Bounded is insufficient.
- Preflight dependencies and shared errors.
- **No concurrent shared-state writes.** Partition authorised writers into
  repository `.worktrees/<task-agent>`; otherwise use a serial applier.
- **Keep topology exact.** One run has one chair. Leaders settle recursive
  obligations. Chair handoff is a generation-bound operator action; independent
  work uses separate sessions.
- **Answer-bearing external work uses Fabric request/reply; Herdr only wakes.**
  Pane injection is fire-and-forget steering. Without callback, record
  `FABRIC-ROUNDTRIP-UNAVAILABLE` and collect an artifact.
- Record worker cwd; never assume repository.
- **Workers write full output to files** when authorised; return a digest/path.
- **Cross-family follows the HARNESS risk ladder.** The other primary is
  load-bearing at substantial+.
- **Objective checks outrank opinions. You own the final call.** Never vote
  weak claims into truth.
- Discover current model/tool options at runtime; record substitutions/failures.

## When This Pays

Before parallel dispatch, require:

- independent information or artefacts;
- stable interfaces and dependencies;
- non-overlapping writes;
- independently checkable return contracts; and
- expected information gain greater than coordination, shared-state and
  tool-density cost.

If this parallel gate fails, keep serial ownership with the chair or one
specialist. Shared errors and tightly coupled work stay serial. Choose the
smallest topology that passes; every topology has one chair.

## Adaptive Loop

1. Preflight authority/isolation/disclosure/receipts; keep the plan skeletal.
2. Use **native same-session subagents** first. **Use same-family CLI only for
   auth/preflight smoke tests**, never as the primary worker substrate.
3. Dispatch parallel read/partitioned-write and serial shared-state waves.
   Adjust leaders/teams only on evidence; paired-primary keeps one chair and
   stage owner.
4. Reduce to a claim/conflict map; verify the live tree before repair.
5. Add only informative waves: narrow, repair, verify, **cross-family broad
   review**, or **Document update wave**.
6. **Final gate:** no untriaged P0/P1, missing anchors, unresolved doc drift,
   unrecorded family status or human gate. Record `CROSS-FAMILY-NOT-RUN` when
   disclosure or availability prevents dispatch.

## Worker Contract

State identity, objective, authority, paths, output, checks, stop and budget.
Validate payloads; never infer permission. Forbid unpartitioned edits and
out-of-scope git restore/checkout/stash. Stop at budget/invariant failure;
record residual work. Handoffs preserve claim/source/confidence/issues/
validation. Certification needs a non-authoring reviewer and verified evidence;
best-effort routes only scout.

## References

Load only relevant file from [references/](references/):
`trigger-boundary.md`, `routing-and-tiers.md`, `codex-subagents.md`,
`dynamic-workflows.md`, `paired-primary.md`, `herdr-panes.md`,
`layering-and-context.md`, `retrieval-and-tool-routing.md`, `verification.md`,
`cli-headless.md`, `debate-and-panels.md`, `memory-scratchpad.md`,
`evaluation-and-observability.md`, `domain-adaptation.md`, and
`system-design-patterns.md`. `scripts/` and `evals/` hold helpers/guards;
`cf_dispatch.sh` is degraded fallback/preflight only.

## Adapter-absent path

Without optional Console, Herdr or GitHub, canonical project artifacts emit the
skill-owned [portable kind](portable-workflow.v1.json). This grants neither
Fabric authority nor a second live task owner.

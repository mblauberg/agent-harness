---
name: orchestrate
description: "Use when bounded fan-out, multi-agent research, cross-family review, parallel audits, or Herdr control improves coverage. Not for tiny work, tightly coupled debugging, or run-until-STOP jobs; use diagnose or autonomous-lab."
---

# Multi-agent orchestration

## Overview

Portable doctrine: decompose -> waves -> reduce -> gate -> finish. The chair
owns synthesis; workers provide isolated, decorrelated coverage.
One chair owns each coordination run and may dynamically appoint leaders,
form/retire teams, pair or reroute inside authority.

## Rules

- Once triggered, **default to fan-out** across bounded, independently useful
  slices. If safe decomposition fails, use a read-only audit fan-out or one
  worker.
- Preflight dependencies, tool density and shared error sources. Keep
  coordination-heavy reasoning with one owner; agent count is not a target.
- **No concurrent shared-state writes.** Partition source scopes. With approved
  worktree authority, writers use isolated repository-owned
  `.worktrees/<task-agent>`; otherwise use read/patch-only workers and one
  serial applier.
- **Answer-bearing external work uses Fabric request/reply; Herdr only wakes.**
  Pane injection is fire-and-forget steering. Without a tested callback, record
  `FABRIC-ROUNDTRIP-UNAVAILABLE` and use an artifact plus bounded collection.
- Record each worker's task-relevant cwd; never assume one global repository.
- **Workers write full output to files** when scratch authority exists and
  return only a short digest plus path.
- **Cross-family follows the HARNESS risk ladder.** The other primary is
  load-bearing at substantial+; bonus families remain non-blocking.
- **Objective checks outrank opinions. You own the final call.** Never
  majority-vote weak claims into truth.
- Discover current model/tool options at runtime; record substitutions and failed lanes.

## When This Pays

Use for broad, decomposable, low-oracle or high-stakes work. Skip small,
tightly coupled or unpartitionable tasks.

## Adaptive Loop

1. Preflight authority, isolation, disclosure and receipts; keep the chair's
   plan skeletal.
2. Use **native same-session subagents** first. **Use same-family CLI only for
   auth/preflight smoke tests**, never as the primary worker substrate.
3. Dispatch parallel read/partitioned-write waves and serial shared-state
   waves. Adjust leaders/teams only on evidence; paired-primary keeps one chair
   and one stage owner.
4. Reduce manifests and digests into a claim/conflict map; verify against the
   live tree before repair.
5. Add only informative waves: narrow, repair, verify, **cross-family broad
   review**, or **Document update wave**.
6. **Final gate:** no untriaged P0/P1, missing anchors, unresolved doc drift,
   unrecorded family status or human gate. Record `CROSS-FAMILY-NOT-RUN` when
   disclosure or availability prevents dispatch.

## Worker Contract

State identity, objective, authority, inputs, owned/prohibited paths, output,
checks, stop condition and budget. Validate payloads; never infer permission.
Forbid source edits unless partitioned and git restore/checkout/stash outside
scope. Stop at budget or repeated invariant failure and record residual work.
Handoffs preserve claim, source, confidence, issues, prohibitions and
validation. Independent certification needs a non-authoring reviewer and
verified evidence. Best-effort routes scout only.

## References

Load only the relevant file from [references/](references/):
`trigger-boundary.md`, `routing-and-tiers.md`, `codex-subagents.md`,
`dynamic-workflows.md`, `paired-primary.md`, `herdr-panes.md`,
`layering-and-context.md`, `retrieval-and-tool-routing.md`, `verification.md`,
`cli-headless.md`, `debate-and-panels.md`, `memory-scratchpad.md`,
`evaluation-and-observability.md`, `domain-adaptation.md`, and
`system-design-patterns.md`. Helpers and static guards live in `scripts/` and
`evals/`; `cf_dispatch.sh` is degraded fallback/preflight, not primary execution.

---
name: orchestrate
description: "Use when bounded fan-out, multi-agent research, cross-family review, parallel audits, or Herdr control improves coverage. Not for tiny work, tightly coupled debugging, or run-until-STOP jobs; use diagnose or autonomous-lab."
---

# Multi-agent orchestration

## Overview

Decompose -> waves -> reduce -> gate. One chair may appoint leaders, form/retire
teams, pair/reroute within authority and synthesise coverage.

## Rules

- **Fan out bounded work**; otherwise assign read-only auditor.
- Preflight dependencies/shared errors. Keep
  coordination-heavy reasoning with one owner.
- **No concurrent shared-state writes.** Partition scopes. With worktree
  authority, writers use isolated repository-owned `.worktrees/<task-agent>`;
  otherwise patch-only workers plus serial applier.
- **Keep topology exact.** Workstreams share one run/chair; settle after
  recursive obligations close. Live chair handoff is a generation-bound
  operator action, never generic takeover. Independent work uses separate
  sessions, never a second live run.
- **Answer-bearing external work uses Fabric request/reply; Herdr only wakes.**
  Pane injection is fire-and-forget steering. Without tested callback, record
  `FABRIC-ROUNDTRIP-UNAVAILABLE`; use an artifact plus bounded
  collection.
- Record worker cwd; never assume global repository.
- **Workers write full output to files** when scratch authority exists and
  return only a short digest plus path.
- **Cross-family follows the HARNESS risk ladder.** The other primary is
  load-bearing at substantial+; bonus families remain non-blocking.
- **Objective checks outrank opinions. You own the final call.** Never
  majority-vote weak claims into truth.
- Discover current model/tool options at runtime; record substitutions and failed lanes.

## When This Pays

Default to fan-out for bounded work.

## Adaptive Loop

1. Preflight authority/isolation/disclosure/receipts; keep the plan
   skeletal.
2. Use **native same-session subagents** first. **Use same-family CLI only for
   auth/preflight smoke tests**, never as the primary worker substrate.
3. Dispatch parallel read/partitioned-write and serial shared-state waves.
   Adjust leaders/teams only on evidence; paired-primary keeps one chair and
   stage owner.
4. Reduce manifests/digests to a claim/conflict map; verify the live tree before
   repair.
5. Add only informative waves: narrow, repair, verify, **cross-family broad
   review**, or **Document update wave**.
6. **Final gate:** no untriaged P0/P1, missing anchors, unresolved doc drift,
   unrecorded family status or human gate. Record `CROSS-FAMILY-NOT-RUN` when
   disclosure or availability prevents dispatch.

## Worker Contract

State identity, objective, authority, owned/prohibited paths, output, checks,
stop and budget.
Validate payloads; never infer permission. Forbid unpartitioned source edits and
git restore/checkout/stash outside scope. Stop at budget or repeated invariant
failure; record residual work. Handoffs preserve claim, source, confidence,
issues and validation. Independent certification needs a non-authoring reviewer
and verified evidence; best-effort routes only scout.

## References

Load only relevant file from [references/](references/):
`trigger-boundary.md`, `routing-and-tiers.md`, `codex-subagents.md`,
`dynamic-workflows.md`, `paired-primary.md`, `herdr-panes.md`,
`layering-and-context.md`, `retrieval-and-tool-routing.md`, `verification.md`,
`cli-headless.md`, `debate-and-panels.md`, `memory-scratchpad.md`,
`evaluation-and-observability.md`, `domain-adaptation.md`, and
`system-design-patterns.md`. Helpers and static guards live in `scripts/` and
`evals/`; `cf_dispatch.sh` is degraded fallback/preflight, not primary execution.

## Adapter-absent path

Without optional Console, Herdr or GitHub, use canonical project artifacts and
emit the skill-owned kind in
[portable-workflow.v1.json](portable-workflow.v1.json). It records coordination
evidence but creates no Fabric authority or second live task owner.

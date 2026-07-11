---
name: orchestrate
description: >
  Use when the task benefits from many agents, fan-out, native subagents, Claude Code
  workflows/ultracode, deep/web research, multi-angle audits, repo-wide sweeps, large migrations,
  independent second opinions, red-team/adversarial review, review-refine loops, cross-family
  verification, model-output synthesis, or high-stakes low-oracle work. Skip tiny edits, simple Q&A,
  tightly coupled debugging, and unpartitionable shared-state writes. Also use for explicit Herdr
  pane, agent, workspace, tab or session inspection/control requests.
---

# Multi-agent orchestration

## Overview

Portable doctrine: decompose -> waves -> reduce -> gate -> finish. Claude Code
or Codex chairs; workers provide context isolation and decorrelated coverage.
Use `autonomous-lab` instead for a standing run-until-STOP job.

## Rules

- Once triggered, **default to fan-out** across bounded, independently useful
  slices. If safe decomposition fails, use a read-only audit fan-out or one
  worker.
- **No concurrent shared-state writes.** Partition source scopes; otherwise
  workers are read-only or patch-only with namespaced artifacts.
- Choose and record each worker's task-relevant cwd. Never assume one global
  repository.
- **Workers write full output to files** when scratch authority exists and
  return only a short digest plus path.
- **Cross-family follows the HARNESS risk ladder.** The other primary is
  load-bearing at substantial+; bonus families remain non-blocking.
- **Objective checks outrank opinions. You own the final call.** Never
  majority-vote weak claims into truth.
- **Discover current model/tool options at runtime.** Route through
  `scripts/model-route` and record substitutions and failed/skipped lanes.

## When This Pays

Use for broad, decomposable, low-oracle or high-stakes work. Skip small,
tightly coupled or unpartitionable tasks.

## Adaptive Loop

1. Preflight authority, isolation, disclosure and receipts; keep the chair's
   plan skeletal.
2. Use **native same-session subagents** first. **Use same-family CLI only for
   auth/preflight smoke tests**, never as the primary worker substrate.
3. Dispatch parallel read/partitioned-write waves and serial shared-state
   waves. Paired-primary mode keeps one chair and one stage owner.
4. Reduce manifests and digests into a claim/conflict map; verify against the
   live tree before repair.
5. Add only informative waves: narrow, repair, verify, **cross-family broad
   review**, or **Document update wave**.
6. **Final gate:** no untriaged P0/P1, missing anchors, unresolved doc drift,
   unrecorded family status or human gate. Record `CROSS-FAMILY-NOT-RUN` when
   disclosure or availability prevents dispatch.

## Worker Contract

State objective, authority, inputs, owned paths, prohibited actions, output,
checks and stop condition. Forbid source edits unless explicitly partitioned;
forbid git restore/checkout/stash outside scope. Handoffs preserve claim,
source, confidence, unresolved issues, prohibited actions and validation.
Independent certification requires a non-authoring reviewer and verified
evidence. Best-effort routes scout only.

## References

Load only the relevant file from [references/](references/):
`trigger-boundary.md`, `routing-and-tiers.md`, `codex-subagents.md`,
`dynamic-workflows.md`, `paired-primary.md`, `herdr-panes.md`,
`layering-and-context.md`, `retrieval-and-tool-routing.md`, `verification.md`,
`cli-headless.md`, `debate-and-panels.md`, `memory-scratchpad.md`,
`evaluation-and-observability.md`, `domain-adaptation.md`, and
`system-design-patterns.md`. Helpers and static guards live in `scripts/` and
`evals/`; `cf_dispatch.sh` is an adapter, not the doctrine.

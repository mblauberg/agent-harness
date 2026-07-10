---
name: orchestrate
description: >
  Use when the task benefits from many agents, fan-out, native subagents, Claude Code
  workflows/ultracode, deep/web research, multi-angle audits, repo-wide sweeps, large migrations,
  independent second opinions, red-team/adversarial review, review-refine loops, cross-family
  verification, model-output synthesis, or high-stakes low-oracle work. Skip tiny edits, simple Q&A,
  tightly coupled debugging, and unpartitionable shared-state writes.
---

# Multi-Agent / Cross-Family Orchestration

## Overview

This is **portable orchestration doctrine**, not a runtime: decompose → waves →
reduce → gate → finish. Claude Code **or Codex** operates it through native dynamic workflows,
subagents, other runners, or shell/SDK drivers. The orchestrator
delegates, synthesises, verifies, and decides. Agents buy **context isolation**, **parallel
coverage**, **specialisation**, and **decorrelated review**. Hold pointers, not payloads. For a
**standing run-until-STOP** job (filesystem lab, crash-safe ledger, human STOP gate), escalate to
**autonomous-lab** — it consumes this doctrine per iteration; this skill finishes and hands back.

## Rules

- **Once triggered, default to fan-out.** Under-delegation is the usual failure mode: run parallel
  waves of bounded workers on distinct slices or angles. Control cost with cheap tiers, tight
  contracts, and pilot slices, not by shrinking the fan-out. Preflight first: the task must split into
  safe slices or partitioned write scopes; if it cannot (shared mutable state), run a read-only audit
  fan-out or a single agent instead of fanning out writers.
- **No concurrent shared-state writes.** Partition source-write scopes, or keep source/evidence
  read-only and allow only namespaced scratch/report writes.
- **Working directory is task-chosen, not orchestrator-fixed.** Do not assume one global cwd for
  dispatched workers. For each worker — especially cross-family CLIs, which need a real git cwd — choose
  the repo/package/subtree whose files the task actually touches, decided from the task itself (the same
  way context state stays task-driven). In multi-repo or workspace layouts, different slices warrant
  different cwds; record the chosen cwd in the dispatch manifest so reduction and rollback stay anchored.
- **Workers write full output to files when scratch writes are authorised.** They return only 3-6
  bullets, surprises, and the path; else keep replies compact.
- **Cross-family follows the HARNESS risk ladder.** Substantial+ work uses the
  other primary; crucial/terminal work attempts bonus families. Below that,
  use it only when information gain justifies the lane. Record every skip or
  failure. Agy remains advisory without an enforced read-only route.
- **Objective checks outrank opinions.** Tests, source anchors, arithmetic, schema checks, and exact
  quotes beat "looks good" review.
- **You own the final call.** Do not majority-vote weak findings into truth.

## When This Pays

Use it for broad, decomposable, low-oracle or high-stakes work. Skip small,
tightly coupled or unpartitionable tasks.

## Execution Substrates

Pick native same-harness orchestration first. Use same-family CLI only for auth/preflight smoke tests,
never as the primary worker substrate. Discover current model/tool options at runtime.

- **Native same-session subagents** — default for a few bounded workers. In Claude Code, use
  subagents in-session; in Codex, spawn parallel subagents and pick `explorer`/`worker` roles when
  exposed. Read-only is **prompt/policy-enforced, not substrate-enforced**: Claude subagents run
  `acceptEdits` and *can* write source regardless of session mode, so every worker prompt must forbid
  source edits unless the worker holds a partitioned scope or returns patch-only. See
  `references/codex-subagents.md`.
- **Claude Code dynamic workflows** (`ultracode`, "run a workflow", saved `/<name>`) — Claude-native
  JavaScript orchestration for many agents, repeatable runs, or script-held state.
  See `references/dynamic-workflows.md`.
- **Codex Ultra / native multi-agent workflows** — on eligible GPT-5.6 sessions,
  Ultra adds maximum reasoning and proactive delegation; otherwise use explicit
  waves. Execute the portable state graph through native collaboration and
  run-dir receipts, not Claude `Workflow()` JavaScript. See
  `references/codex-subagents.md`.
- **Paired primary** — opt-in Claude+Codex collaboration with one session chair,
  rotating stage owners, durable artifact messages and one writer per shared
  surface. Both sides may delegate independently inside assigned scope. See
  `references/paired-primary.md`.
- **Cross-family CLIs** (claude, codex, gemini/agy, cursor, …) — use for safe
  different-family exploration, review and verification. `cf_dispatch.sh` is one
  adapter, not the doctrine. See `references/cli-headless.md`.

## Adaptive Loop

Waves are dynamic. The examples below are a menu, not a fixed recipe. After each reduce step, decide
the next wave: `continue`, `narrow`, `repair`, `verify`, `document`, or `stop`.

1. **Plan skeleton only.** Keep decomposition, dispatch contracts, synthesis, adjudication, and final
   authority. Delegate broad exploration, source hunts, audits, research, and bounded implementation.
2. **Decompose by isolation.** Split by source slice, file/module, claim family, threat model, role, or
   document surface. Use serial waves when edits share state; parallel waves when scopes are independent.
3. **Dispatch adaptive waves.** Record one owner and authority envelope per stage; close its barrier
   before rotating ownership. Native subagents/workflows handle scoped sections; cross-family workers
   run alongside them with broader/adversarial lenses and deliberate overlap on risky claims.
4. **Reduce after each wave.** Read manifests/summaries first; build a conflict and claim map without
   importing raw payloads. Do not majority-vote weak claims into truth.
5. **Add waves as needed.** Common wave types: orientation, wide review, scoped section review,
   implementation, repair, native verification, cross-family broad review, document update, closure.
6. **Document update wave.** When implementation or audit changes user-facing behavior, architecture,
   runbooks, decisions, or release evidence, dispatch a docs wave and verify docs against current source.
7. **Final gate.** Do not final while P0/P1 findings are untriaged, anchors missing, document drift
   unresolved, cross-family statuses unrecorded, or human-authority gates unresolved.

## Worker Contract

Default contract, adapt path/scope:

> Keep source read-only unless assigned a partitioned edit scope. Write full findings to
> `<run-dir>/findings/<name>.md` if scratch/report writes are allowed. Reply with ONLY: 3-6 headline
> findings, contradictions/surprises, unresolved questions, and the file path. Do not paste full output.

Write-authorised prompts forbid git restore/checkout/stash outside scope; use a
byte copy for mutation restoration. Verify external findings against the live
tree before fixing. Review the post-repair surface independently.

Handoffs preserve: `claim`, `source`, `confidence`, `unresolved`, `prohibited-action`, `validation`.

## Cross-Family Workers & Escalation Gate

- Clear provider disclosure before external dispatch; redact or record
  `CROSS-FAMILY-NOT-RUN`. Certified status requires `status=ok`, a distinct
  family and enforced read-only evidence. Best-effort lanes such as Agy remain
  advisory until a primary verifies their evidence.
- Native reviewers take narrow surfaces; cross-family reviewers take broader
  architecture, omission and adversarial lenses. High-risk claims need both.
- A single serial applier may auto-apply only authorised low-risk edits with a
  scoped diff, objective before/after evidence and rollback. High-risk edits are
  validated patches for a human gate. See `cli-headless.md` for receipts and
  provider-specific constraints.

## References

All paths below resolve under this skill. Host repositories may also ship their own
`docs/orchestration/dynamic-workflows.md`; treat those as local doctrine only for that repo. In
`references/`:
`dynamic-workflows.md` (workflow runtime + saved-workflow authoring), `codex-subagents.md`,
`layering-and-context.md`, `trigger-boundary.md`, `retrieval-and-tool-routing.md`,
`routing-and-tiers.md`, `verification.md`, `debate-and-panels.md`, `memory-scratchpad.md`,
`evaluation-and-observability.md`, `domain-adaptation.md`, `cli-headless.md`,
`herdr-panes.md`,
`paired-primary.md`,
`system-design-patterns.md` (topology & framework choice when building an agent system). Also `scripts/`
(helpers) and `evals/` (static guards). `cf_dispatch.sh` = *single-dispatch adapter* (one prompt →
one tool, JSON status, fail-closed same-family); autonomous-lab's `cross-family.sh` = sibling
*review-capture* wrapper — don't duplicate either.

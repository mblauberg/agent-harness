# Cross-family review in a persistent lab

Use this reference only for the durable lab-state seam around an independently
routed review. `orchestrate` owns provider routing, topology, the HARNESS risk
ladder, reviewer selection, Agent Fabric transport, degradation and result
contracts. Do not copy those policies into the lab.

All answer-bearing cross-family work goes through Agent Fabric under an
`orchestrate` wave. Direct CLIs are preflight or an explicitly recorded degraded
fallback. The lab adds persistence and recovery; it never invents a second
routing policy.

## Before dispatch

Record the bounded wave in `.orchestrator/runs.md` and `STATE.md` before launch:

- work/decision ID and exact artifact digest or revision;
- authority and disclosed paths;
- review question and required evidence;
- expected result and route-receipt paths;
- expiry, timeout and recovery instruction.

The author/decider cannot certify its own surface. Let `orchestrate` determine
which review legs load-bear for the current risk and which are advisory.

## Capture

Persist the independent provider result verbatim at the declared review path,
normally `adr/_reviews/<id>-<family>.md`, plus its Fabric route/result receipt.
Then link both from the run ledger, the owning ADR/artifact and `STATE.md`. A
worker's prose claim that another reviewer passed has no authority; the
independent result and receipt are the source.

Every attempted leg remains visible as `pass`, `failed`, `unavailable` or
`skipped` with actual lineage and reason. Never erase a failed attempt after a
retry or silently substitute a same-family result.

## Adjudicate and repair

The chair checks findings against live artifacts and objective oracles; it does
not majority-vote model prose. For gate-class artifacts, ask the independent
reviewer to rerun the highest-risk negative or mutation oracle. Route confirmed
correctness defects through the enclosing lifecycle.

Use [anti-placebo-and-convergence.md](anti-placebo-and-convergence.md) for the
PIERCE/owed distinction and [recovery-and-cadence.md](recovery-and-cadence.md)
for the bounded repair ceiling. A failed review is evidence, not permission for
an unbounded loop.

## Recovery

If dispatch or capture is interrupted, preserve the partial result and receipt,
leave the run-ledger row in flight, and make the next action explicit in
`STATE.md`. `RECONCILE` decides whether to attach, retry within the declared
bound, or escalate. Never relaunch merely because the task tracker lost sight of
a still-live provider run.

## Checklist

- Exact target and authority recorded before launch.
- Author and certifier are independent.
- Fabric result and route receipt persisted separately from the build report.
- Actual family/model/adapter and non-pass attempts retained.
- High-risk finding checked against live evidence.
- Repair bound and escalation path declared.
- Ledger, ADR/artifact and STATE point to the same result.

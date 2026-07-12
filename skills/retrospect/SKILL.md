---
name: retrospect
description: "Use after delivery, release, incident, evaluation, or a long run to derive evidence-backed process improvements and regression gates. Not for session cleanup, one skill audit, or an active defect; use session, skill-audit, or implement."
---

# Retrospect

Turn completed-cycle evidence into a better next cycle: benchmark, diagnose,
propose, verify and monitor.
Do not produce retrospective theatre or one dated log per run.
Scale depth to risk and friction: a clean routine cycle may return `no change`;
substantial runs, escaped defects and repeated human corrections need the full pass.

## Evidence boundary

Start from the approved spec, run receipts, checks/evals, review and repair
history, human corrections, escaped defects, production observations, routing
failures, resource use and retained artifacts. Use only authorised sources.
Mark a dimension `unknown` when evidence is absent; never infer success from a
clean final answer.

For substantial+ or repeated cycles, create
`RETROSPECT.json` from the [template](templates/RETROSPECT.template.json) and validate with
`scripts/validate_retrospect.py`. It is evidence, not diary or project truth.

## Review dimensions

- outcome and acceptance-criteria success;
- trajectory compliance, safety and escaped defects;
- human attention, corrections, rework, gate latency, unnecessary interruption
  and blocked time;
- test/eval and reviewer effectiveness;
- orchestration, model routing, delegation and tool reliability;
- context size, compaction, handoff and artifact hygiene;
- skill triggering, usefulness, overlap and missing capability;
- documentation, project memory and canonical-state freshness;
- cost and latency when receipts contain trustworthy measures.

## Flywheel

1. **Benchmark** against declared acceptance criteria, eval thresholds,
   baseline and prior comparable runs. Separate output quality from trajectory.
2. **Diagnose** recurring failures by root-cause cluster: product/code,
   specification, test/eval, skill, instructions, routing/adapter, tool,
   context/memory, documentation or authority/process.
3. **Propose** the smallest change that addresses each supported cluster. Every
   proposal names evidence, owner, risk, destination and a success measure.
4. **Verify**: convert representative failures into deterministic tests or
   versioned eval cases and run the regression suite before claiming improvement.
5. **Monitor** the next comparable cycle for recurrence, regressions, cost and
   new failure modes. Feed supported attention and gate changes into the next
   scope cycle instead of creating a parallel process diary.

`improved` requires an authorised intervention, passing regression gate and
enough comparable later cycles meeting predeclared target and guard metrics.
Underpowered or confounded evidence is `inconclusive`.

Route unclear intent to `scope`, deterministic defects to `implement`,
stochastic behaviour to `evaluate`, individual skill evidence to `skill-audit`,
and context/docs cleanup to `session` or `engineering-docs`.

## Learning and authority

Promote durable conclusions into their canonical owner: spec/ADR, runbook,
project instructions, state/context digest, test/eval fixture, skill or routing
policy. Merge with existing truth; do not append a parallel diary. Project
facts never live only in private memory, and cross-project preferences follow
the harness memory policy.

This skill is proposal-first and read-only by default. Apply project or global
harness changes only under explicit authority or an enclosing `implement` run;
material cross-project changes return through human-approved scope. Finish with
a compact table: finding, evidence, root cause, proposed change, regression
gate, owner/destination and status (`promote`, `experiment`, `defer`, `reject`).

## Adapter-absent path

Console, Herdr and GitHub are optional. Continue from canonical project
artifacts and emit the skill-owned artifact kind in
[portable-workflow.v1.json](portable-workflow.v1.json). That filesystem
artifact records retrospective evidence; proposed improvements still require
their normal authority.

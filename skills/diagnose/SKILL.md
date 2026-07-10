---
name: diagnose
description: "Use when debugging broken behaviour, errors, crashes, test failures, or performance regressions — 'diagnose this', 'debug this', 'why is this failing', 'it is not working'. Diagnosis is read-only/temporary-instrumentation by default; permanent repair requires explicit fix authority or an enclosing implement run."
---

# Diagnose

A discipline for hard bugs. Work the phases in order; skip one only with an explicit reason. First build a clear mental model of the modules involved and check any decisions or constraints recorded for the area.

## The Iron Law

```
NO FIX WITHOUT A REPRODUCTION AND A ROOT CAUSE FIRST
```

A fix aimed at a symptom you haven't reproduced is a guess that masks the real bug and spawns new ones. Under time pressure this is *faster* than guess-and-check thrashing — resist "just try changing X and see".

## Phase 1 — Build a feedback loop

**This is the skill.** A fast, deterministic pass/fail signal makes everything else — bisection, hypothesis testing, instrumentation — mechanical. Without one, staring at code won't save you. Spend disproportionate effort here.

Ways to build one, roughly easiest first:
1. **Failing test** at whatever seam reaches the bug.
2. **Curl/HTTP script** against a running dev server.
3. **CLI invocation** on a fixture, diffing output against known-good.
4. **Headless browser script** driving the UI, asserting on DOM/console/network.
5. **Replay a captured trace** — save a real request/payload/log, replay it in isolation.
6. **Throwaway harness** — a minimal subset of the system exercising the path in one call.
7. **Property/fuzz loop** for "sometimes wrong output" bugs.
8. **Bisection harness** if it appeared between two known states (`git bisect run`).
9. **Differential loop** — same input through old vs new, diff outputs.
10. **Human-in-the-loop script** — last resort; structure the loop even when a human must click. See [scripts/hitl-loop.template.sh](scripts/hitl-loop.template.sh).

Then sharpen it: faster (cache setup, narrow scope), sharper (assert the specific symptom, not "didn't crash"), more deterministic (pin time, seed RNG, isolate FS/network). A 2-second deterministic loop beats a 30-second flaky one.

**Non-deterministic bugs:** aim for a higher reproduction *rate*, not a clean repro. Loop the trigger, parallelise, add stress, narrow timing windows. 50% flake is debuggable; 1% isn't.

**Genuinely can't build one?** Stop and say so. List what you tried and ask for environment access, a captured artifact (HAR, log dump, core dump, recording), or permission to add temporary instrumentation. Don't hypothesise without a loop.

## Phase 2 — Reproduce

Run the loop; watch the bug appear.
- [ ] It's the failure the **user** described — not a nearby lookalike. Wrong bug → wrong fix.
- [ ] Reproducible across runs (or at a high enough rate to debug against).
- [ ] You've captured the exact symptom so later phases can confirm the fix.

## Phase 3 — Hypothesise

Generate **3–5 ranked, falsifiable hypotheses** before testing any — a single guess anchors you on the first plausible idea. Each states a prediction: "if X is the cause, changing Y makes it disappear." Can't state a prediction? It's a vibe; sharpen or drop it. Check what changed recently (diffs, deploys, new deps). Show the ranked list to the user if they're around — they often re-rank it instantly.

## Phase 4 — Instrument

Each probe maps to one prediction. **Change one variable at a time.** Prefer a debugger/REPL breakpoint over logs; use targeted logs at the boundaries that separate hypotheses, not "log everything and grep". Tag every debug log with a unique prefix (e.g. `[DBG-a4f2]`) so cleanup is one grep. For performance regressions, logs mislead: measure first — baseline, profile, bisect.

## Phase 5 — Fix + regression test

Enter this phase only when the user requested a fix or `diagnose` is nested
inside an authorised `implement` run with matching write scope. Otherwise stop after
root cause with the proposed regression-test seam, affected paths, confidence
and repair handoff. Temporary instrumentation never implies permanent edits.

Write the regression test **before** the fix — but only where a **correct seam** exists: one that exercises the real bug pattern at the call site. A too-shallow seam gives false confidence; if none exists, *that is the finding* — note it, the architecture is preventing lockdown. Where a seam exists: turn the repro into a failing test, watch it fail, apply the fix, watch it pass, then re-run the Phase 1 loop against the original scenario. Fix the root cause in one change — no bundled refactoring.

## Phase 6 — Cleanup + post-mortem

- [ ] Original repro no longer reproduces (re-run the loop)
- [ ] Regression test passes (or the absent seam is documented)
- [ ] All tagged debug instrumentation removed (grep the prefix)
- [ ] Throwaway prototypes deleted
- [ ] The winning hypothesis stated in the commit/PR message, so the next debugger learns

Then ask: **what would have prevented this?** If the answer is architectural (no seam, tangled callers, hidden coupling), flag it with specifics — after the fix lands, when you know most.

## When 3+ fixes fail

Stop. Repeated failures that each surface a new problem elsewhere signal a wrong architecture, not a wrong hypothesis. Question the design with the user before another patch.
